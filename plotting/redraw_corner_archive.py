"""Redraw exact published snapshots; never start or extend an MCMC chain."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import hashlib
import json
import multiprocessing
from pathlib import Path
import shutil
import tempfile

from corner_style import (STYLE_VERSION, LF_LABELS, JOINT_LABELS,
                          native_stellar_ensembles, render_corner, sha256_file)


def json_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def names(handle):
    return [v.decode() if isinstance(v, bytes) else str(v) for v in handle["parameter_names"][:]]


@contextmanager
def frozen_h5(path, digest, temp_root):
    """Verify a byte snapshot without interfering with a writer's HDF5 lock."""
    import h5py
    with tempfile.TemporaryDirectory(prefix="corner-chain-", dir=temp_root) as temporary:
        snapshot = Path(temporary)/"chain.h5"
        shutil.copyfile(path, snapshot)
        if sha256_file(snapshot) != digest or sha256_file(path) != digest:
            raise ValueError(f"Chain changed during snapshot: {path}")
        with h5py.File(snapshot, "r") as handle:
            yield handle
        if sha256_file(path) != digest:
            raise ValueError(f"Chain changed during read: {path}")


def draw_lf(model, sources, project_root, output):
    import numpy as np
    chains, provenance = [], []
    steps, walkers = model["steps_per_ensemble"], model["walkers"]
    for source in sources:
        with frozen_h5(project_root/source["file"], source["sha256"], output.parent) as handle:
            assert names(handle) == ["ETA_STAR", "t_STAR", "ALPHA_STAR", "M_TURN"]
            assert json.loads(handle.attrs["model_json"]) == {key: model[key] for key in ("KP_h_Mpc", "MS")}
            dataset = handle["production/chain"]
            assert dataset.shape[0] >= steps and dataset.shape[1:] == (walkers, 4)
            chain = dataset[:steps]
        chains.append(chain)
        provenance.append({"file": source["file"], "file_sha256": source["sha256"],
                           "retained_shape": list(chain.shape),
                           "retained_values_sha256": hashlib.sha256(np.ascontiguousarray(chain).tobytes()).hexdigest()})
    arrays = native_stellar_ensembles(chains)
    assert sum(len(a) for a in arrays) == model["sample_count"]
    gate = "Diagnostic gate passed" if model["diagnostic_gate_passed"] else "Diagnostic gate not passed"
    audit = render_corner(arrays, LF_LABELS, output, title="LF only / sampling distributions",
                          subtitle=rf"Fixed $k_p = {model['KP_h_Mpc']:g}\ h\,\mathrm{{Mpc}}^{{-1}}$; $m_s = {model['MS']:g}$",
                          notes=[f"{steps:,} retained steps × {walkers} walkers / ensemble",
                                 "Initial burn-in: 500 steps; no new discard",
                                 "Solid / 68%; dashed / 95% binned mass", gate,
                                 "Exploratory; not final constraints"])
    audit["sources"] = provenance
    return audit


def draw_joint(joint, project_root, output):
    arrays = []
    for source in joint["sources"]:
        with frozen_h5(project_root/source["file"], source["sha256"], output.parent) as handle:
            assert names(handle) == ["ETA_STAR", "t_STAR", "ALPHA_STAR", "M_TURN", "F_ESC10", "ALPHA_ESC", "MS"]
            assert list(handle["chain"].shape) == source["shape"] == [160, 64, 7]
            arrays.append(handle["chain"][:].reshape(-1, 7))
    labels = JOINT_LABELS
    if output.name == "corner_native.png":
        arrays = native_stellar_ensembles(arrays)
        labels = [LF_LABELS[0], *JOINT_LABELS[1:]]
    return render_corner(arrays, labels, output,
                         title="LF + τ + xHI / sampling distributions",
                         subtitle=r"Fixed $k_p = 1\ h\,\mathrm{Mpc}^{-1}$; sampled $m_s$",
                         notes=["160 retained steps × 64 walkers / ensemble",
                                "Initial burn-in: 40 steps; no new discard",
                                "Solid / 68%; dashed / 95% binned mass",
                                "PRELIMINARY / NOT CONVERGED",
                                "Correlated samples; not final constraints"])


def _worker(connection, function, args):
    try:
        connection.send((True, function(*args)))
    except Exception as error:
        connection.send((False, repr(error)))
    finally:
        connection.close()


def render_isolated(function, args, cache_root, identity):
    """Bound HDF5 chunk-cache AND plotting memory to a single figure's lifetime."""
    signature = hashlib.sha256(json.dumps(identity, sort_keys=True).encode())
    for file in (Path(__file__), Path(__file__).with_name("corner_style.py")):
        signature.update(sha256_file(file).encode())
    output = args[-1]
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = cache_root/(output.name + ".json")
    if cache.exists() and output.exists():
        previous = json.loads(cache.read_text())
        if previous["signature"] == signature.hexdigest() and previous["figure_sha256"] == sha256_file(output):
            return previous["audit"]
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=_worker, args=(sender, function, args))
    process.start()
    sender.close()
    try:
        passed, result = receiver.recv()
    except EOFError as error:
        raise RuntimeError(f"Corner worker interrupted: {output}; resume is safe") from error
    finally:
        receiver.close()
        process.join()
    if process.exitcode != 0 or not passed:
        raise RuntimeError(f"Corner worker failed: {result}")
    json_write(cache, {"signature": signature.hexdigest(), "figure_sha256": sha256_file(output), "audit": result})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--site-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--indices", nargs="*", type=int, help="Preview selected LF models plus both joint corners; no publication manifests")
    parser.add_argument("--resume", action="store_true", help="Reuse output after source, renderer and pixel-hash checks")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=args.resume)
    lf = json.loads((args.site_root/"web_data/lf_corner/index.json").read_text())
    joint = json.loads((args.site_root/"web_data/ms_corner_chunk1/index.json").read_text())
    catalog = json.loads((args.site_root/"web_data/mcmc/index.json").read_text())
    audits = {}
    for model in lf["models"]:
        if args.indices is not None and model["model_index"] not in args.indices:
            continue
        report = args.project_root/model["source_report"]
        if sha256_file(report) != model["source_report_sha256"]:
            raise ValueError(f"Source report changed: {report}")
        sources = []
        for ensemble in (0, 1):
            path = report.parent/f"ensemble_{ensemble}.h5"
            sources.append({"file": str(path.relative_to(args.project_root)), "sha256": sha256_file(path)})
        output = args.output/"web_data/lf_corner"/model["file"]
        audit = render_isolated(draw_lf, (model, sources, args.project_root, output),
                                args.output/".render-cache", [model, sources])
        audits[f"lf_corner/{model['file']}"] = audit
        model["figure_sha256"] = sha256_file(output)
        model["figure_style"] = STYLE_VERSION
        model["figure_sources"] = audit["sources"]
        print(f"LF {model['model_index']+1:02d}/25: {model['file']} — layout passed", flush=True)
    joint["figure_sha256"] = {}
    for filename in ("corner_eta.png", "corner_native.png"):
        for source in joint["sources"]:
            assert sha256_file(args.project_root/source["file"]) == source["sha256"]
        output = args.output/"web_data/ms_corner_chunk1"/filename
        audits[f"ms_corner_chunk1/{filename}"] = render_isolated(
            draw_joint, (joint, args.project_root, output), args.output/".render-cache", [joint, filename])
        joint["figure_sha256"][filename] = sha256_file(output)
        print(f"Joint: {filename} — layout passed", flush=True)
    json_write(args.output/"web_data/mcmc/corner_layout_audit.json", audits)
    if args.indices is not None:
        print("Preview only; no publication manifests generated.", flush=True)
        return
    assert len(audits) == 27 and all(audit["passed"] for audit in audits.values())
    lf["figure_style"] = joint["figure_style"] = STYLE_VERSION
    json_write(args.output/"web_data/lf_corner/index.json", lf)
    json_write(args.output/"web_data/ms_corner_chunk1/index.json", joint)
    for model in lf["models"]:
        catalog["files_sha256"][f"web_data/lf_corner/{model['file']}"] = model["figure_sha256"]
    for filename, digest in joint["figure_sha256"].items():
        catalog["files_sha256"][f"web_data/ms_corner_chunk1/{filename}"] = digest
    for name in ("lf_corner/index.json", "ms_corner_chunk1/index.json", "mcmc/corner_layout_audit.json"):
        catalog["files_sha256"][f"web_data/{name}"] = sha256_file(args.output/"web_data"/name)
    catalog["figure_style"] = STYLE_VERSION
    catalog["categories"]["lf_only"]["provenance"] += " Redrawn from the same retained rows using the shared LF/joint corner style; ensembles shown separately. No new sampling or convergence calculation."
    json_write(args.output/"web_data/mcmc/index.json", catalog)
    print("27 corners rendered; all published snapshot lengths and diagnostic flags preserved.", flush=True)


if __name__ == "__main__":
    main()
