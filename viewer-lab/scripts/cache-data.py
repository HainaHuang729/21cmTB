"""Cache pinned, verified data. --all-sample downloads the complete glow viewer."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'cf448836d866a772e3a4a7a05a874994cafd4021'
UPSTREAM_REVISION = '7daaaca68ac6df4f9ccd95fbb1bbb16ecc042fc0'
REVISIONS = {'pl': REVISION, 'bt': UPSTREAM_REVISION, 'legacy': UPSTREAM_REVISION}
DIRECTORIES = {
    'pl': 'viewer-lab/data/pl-thermal-fixed-v3',
    'bt': 'viewer-data64/pl-bt-v1/coeval-bt256-full-v1-display64',
    'legacy': 'viewer/data/coeval-f-star10-m1p3-d2fb547ce0',
}


def jobs_for(registry, all_sample):
    jobs = []
    for model, directory in DIRECTORIES.items():
        if all_sample and model == 'legacy':
            continue
        manifest = json.loads((ROOT / f'data/{model}-manifest.json').read_text())
        snapshots = manifest['snapshots']
        if model == 'legacy':
            ids = {manifest['defaultSnapshot'], min(snapshots, key=lambda s: s['fields']['brightness_temperature']['statistics']['mean'])['id'], snapshots[0]['id']}
        else:
            ids = {s['id'] for s in snapshots if f'{model}/{s["id"]}' in registry}
        for snapshot in snapshots:
            prefix = f'{model}/{snapshot["id"]}/'
            if not all_sample and snapshot['id'] not in ids and not any(key.startswith(prefix) for key in registry):
                continue
            for field, descriptor in snapshot['fields'].items():
                if all_sample:
                    if field not in ('xH', 'density', 'brightness_temperature') or snapshot.get('fieldQuality', {}).get(field, {}).get('status', 'range-check-passed') != 'range-check-passed':
                        continue
                elif snapshot['id'] not in ids and prefix + field not in registry:
                    continue
                registered = registry.get(prefix + field) or (registry.get(f'{model}/{snapshot["id"]}') if field == 'xH' else None)
                relative = Path(registered).as_posix() if registered else f'data/{model}/{snapshot["id"]}/{field}.f32.bin'
                url = f'https://raw.githubusercontent.com/HainaHuang729/21cmTB/{REVISIONS[model]}/{directory}/{descriptor["url"]}'
                jobs.append((prefix + field, relative, url, descriptor['sha256'], descriptor['byteLength']))
    return jobs


def download(job):
    key, relative, url, expected, length = job
    destination = ROOT / relative
    if destination.exists():
        data = destination.read_bytes()
        if len(data) == length and hashlib.sha256(data).hexdigest() == expected:
            return key, './' + relative
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=40) as response:
                data = response.read()
            if len(data) != length or hashlib.sha256(data).hexdigest() != expected:
                raise ValueError(f'Integrity check failed: {key}')
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix('.part')
            temporary.write_bytes(data)
            temporary.replace(destination)
            return key, './' + relative
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def save_registry(registry):
    temporary = ROOT / 'data/local-files.json.tmp'
    temporary.write_text(json.dumps(dict(sorted(registry.items())), indent=2) + '\n')
    temporary.replace(ROOT / 'data/local-files.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--all-sample', action='store_true', help='Cache all currently published PL/BT fields; withheld snapshots are excluded')
    args = parser.parse_args()
    registry = json.loads((ROOT / 'data/local-files.json').read_text())
    jobs = jobs_for(registry, args.all_sample)
    errors = []
    print(f'Verifying/caching {len(jobs)} real fields ({len(jobs)} MiB)', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        pending = {executor.submit(download, job): job[0] for job in jobs}
        for count, future in enumerate(concurrent.futures.as_completed(pending), 1):
            try:
                key, relative = future.result()
                registry[key] = relative
            except Exception as error:
                errors.append((pending[future], str(error)))
            if count % 10 == 0 or count == len(jobs):
                save_registry(registry)
                print(f'{count}/{len(jobs)} checked; {len(errors)} failed', flush=True)
    save_registry(registry)
    if errors:
        for key, error in errors:
            print(f'FAILED {key}: {error}', flush=True)
        raise SystemExit(1)
    print(f'Complete: {len(jobs)} verified fields available locally', flush=True)


if __name__ == '__main__':
    main()
