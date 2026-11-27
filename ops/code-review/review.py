"""Review public Atenda diffs with a locally pinned analyzer. Never check out a PR."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen

ORIGIN = "https://github.com/mateusforest/atenda.git"
PULLS = "https://api.github.com/repos/mateusforest/atenda/pulls"
STATE = Path(os.environ.get("STATE_DIRECTORY", "/var/lib/atenda-review"))
REPO = STATE / "repository.git"
REPORTS = STATE / "reports"
ANALYZER = Path(__file__).with_name("pr-analyzer.py")


def git(*args):
    return subprocess.check_output(["git", "--git-dir", str(REPO), *args],
                                   text=True, encoding="utf-8").strip()


def replace(path, text):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8",
                                     delete=False) as tmp:
        tmp.write(text)
    os.replace(tmp.name, path)


def previous(target):
    pointer = REPORTS / (target + ".json")
    return json.loads(pointer.read_text()) if pointer.exists() else {}


def review(target, base, head):
    if previous(target) == {"base": base, "head": head}:
        return
    with tempfile.TemporaryFile() as patch:
        subprocess.run(["git", "--git-dir", str(REPO), "diff", "--no-ext-diff",
                        "--no-textconv", "--no-color", base, head, "--"],
                       stdout=patch, check=True)
        if patch.tell():
            patch.seek(0)
            report = subprocess.check_output([sys.executable, "-I", str(ANALYZER), "--stats"],
                                             stdin=patch, text=True, encoding="utf-8")
        else:
            report = "Nenhuma alteração de conteúdo.\n"
    label = f"{target}-{base[:12]}-{head[:12]}.txt"
    replace(REPORTS / label, f"https://github.com/mateusforest/atenda/compare/{base}...{head}\n{report}")
    replace(REPORTS / (target + ".json"), json.dumps({"base": base, "head": head}))
    print(f"Relatório salvo: {label}", flush=True)


def open_pulls():
    page = 1
    while True:
        request = Request(f"{PULLS}?state=open&base=main&per_page=100&page={page}",
                          headers={"User-Agent": "Atenda-Code-Review", "Accept": "application/vnd.github+json"})
        with urlopen(request, timeout=20) as response:
            rows = json.load(response)
        for row in rows:
            yield int(row["number"])
        if len(rows) < 100:
            return
        page += 1


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--initial-base", help="Base da primeira revisão da main")
    options = args.parse_args()
    REPORTS.mkdir(parents=True, exist_ok=True)
    if not REPO.exists():
        subprocess.run(["git", "init", "--bare", "--quiet", str(REPO)], check=True)
    git("fetch", "--quiet", "--no-tags", ORIGIN, "+refs/heads/main:refs/heads/main")
    main_head = git("rev-parse", "refs/heads/main")
    prior = previous("main").get("head")
    if main_head != prior:
        base = prior or git("rev-parse", options.initial_base or "refs/heads/main^")
        review("main", base, main_head)
    errors = []
    for number in open_pulls():
        ref = f"refs/review/pr-{number}"
        try:
            git("fetch", "--quiet", "--no-tags", ORIGIN, f"+refs/pull/{number}/head:{ref}")
            head = git("rev-parse", ref)
            base = git("merge-base", main_head, ref)
            # The pulls API can still list a just-merged PR. Keep its final review.
            if base != head:
                review(f"pr-{number}", base, head)
        except subprocess.CalledProcessError:
            errors.append(number)
    if errors:
        raise RuntimeError(f"Revisar novamente os PRs {errors}")


if __name__ == "__main__":
    main()
