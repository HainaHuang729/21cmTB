"""Make verified local byte copies of archive inputs, never modify live chains."""
import argparse
import json
from pathlib import Path
import shutil

from corner_style import sha256_file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--site-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    lf = json.loads((args.site_root/"web_data/lf_corner/index.json").read_text())
    joint = json.loads((args.site_root/"web_data/ms_corner_chunk1/index.json").read_text())
    targets = {}
    for model in lf["models"]:
        report = Path(model["source_report"])
        targets[str(report)] = model["source_report_sha256"]
        for ensemble in (0, 1):
            targets[str(report.parent/f"ensemble_{ensemble}.h5")] = None
    for source in joint["sources"]:
        targets[source["file"]] = source["sha256"]
    hashes = {}
    for relative, required in targets.items():
        source, target = args.project_root/relative, args.output/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(5):
            shutil.copyfile(source, target)
            digest = sha256_file(target)
            if digest == sha256_file(source):
                break
        else:
            raise ValueError(f"Could not capture a stable byte snapshot: {source}")
        if required and digest != required:
            raise ValueError(f"Archived source hash mismatch: {source}")
        hashes[relative] = digest
    (args.output/"snapshot_hashes.json").write_text(json.dumps(hashes, indent=2)+"\n")
    print(f"Verified {len(hashes)} source copies; original files unchanged.", flush=True)


if __name__ == "__main__":
    main()
