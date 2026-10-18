"""Verify the entire repaired BT display export before activating references."""
import argparse, array, hashlib, json, math, shutil, sys
from pathlib import Path

LAB = Path(__file__).resolve().parents[2]

def read(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    temporary = path.with_suffix(path.suffix + '.pending')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)

def main(export):
    validation = read(export / 'validation.json')
    assert validation['passed'] and validation['snapshots'] == 85 and validation['volumes'] == 255
    design = validation['comparisonDesign']
    assert design['coldIndependentDensityPassed'] and design['matchedPerturbControlPassed']
    assert not design['sharedEvolvedFields'] and not design['tolerancesChanged']
    source = export / 'coeval-bt256-thermal-fixed-v2-display64'
    manifest = read(source / 'manifest-all.json')
    inputs = read(Path(__file__).with_name('parameter-validation.json'))
    assert inputs['passed']
    assert manifest['source_simulation_id'] == 'coeval-bt256-thermal-fixed-v2'
    assert manifest['sourceIdentity'] == validation['sourceIdentity'] == inputs['recomputedIdentitySHA256']
    assert manifest['thermalEvolutionRepair']['sameInitialConditions']
    assert not manifest['thermalEvolutionRepair']['physicalParametersChanged']
    assert manifest['identity']['icFingerprint'] == inputs['inputs']['initial_conditions_sha256']
    assert [s['redshift'] for s in manifest['snapshots']] == inputs['inputs']['requested_redshifts']
    files = []
    for snapshot in manifest['snapshots']:
        assert snapshot['fieldQuality']['brightness_temperature']['status'] == 'range-check-passed'
        assert set(snapshot['fields']) == {'xH', 'density', 'brightness_temperature'}
        for key, descriptor in snapshot['fields'].items():
            path = source / descriptor['url']
            assert path.resolve().is_relative_to(source.resolve())
            assert descriptor['byteLength'] == 64**3 * 4 == path.stat().st_size
            assert sha(path) == descriptor['sha256'], path
            values = array.array('f', path.read_bytes())
            if sys.byteorder != 'little':
                values.byteswap()
            assert len(values) == 64**3 and all(math.isfinite(v) for v in values)
            low, high = min(values), max(values)
            stats = descriptor['statistics']
            assert low == stats['min'] and high == stats['max']
            assert abs(sum(values) / len(values) - stats['mean']) <= 1e-7 * max(1, abs(stats['mean']))
            assert stats['nonfinite'] == 0 and stats['count'] == 64**3
            if key == 'xH':
                assert 0 <= low <= high <= 1
            elif key == 'density':
                assert low >= -1
            assert descriptor['sourceId'] == snapshot['fields']['xH']['sourceId']
            files.append((snapshot['id'], key, path, descriptor))
    # The current manifest and registry stay untouched until every file passes.
    target = LAB / 'data/bt-thermal-fixed-v2'
    registry = read(LAB / 'data/local-files.json')
    for sid, key, path, descriptor in files:
        destination = target / descriptor['url']
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            temporary = destination.with_suffix('.pending')
            shutil.copyfile(path, temporary)
            temporary.replace(destination)
        assert sha(destination) == descriptor['sha256']
        registry[f'bt/{sid}/{key}'] = './' + destination.relative_to(LAB).as_posix()
    for key in list(registry):
        if key.startswith('bt/') and len(key.split('/')) == 2:
            registry[key] = registry[key + '/xH']
    archive = LAB / 'data/bt-manifest-source-v1.json'
    if not archive.exists():
        save(archive, read(LAB / 'data/bt-manifest.json'))
    save(LAB / 'data/bt-manifest.json', manifest)
    save(LAB / 'data/local-files.json', dict(sorted(registry.items())))
    save(LAB / 'science/bt-thermal-repair/native-validation.json', validation)
    print('Activated 85 BT redshifts / 255 verified field volumes; old payloads preserved.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export_root', type=Path)
    main(parser.parse_args().export_root)
