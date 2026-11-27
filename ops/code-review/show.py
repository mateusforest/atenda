"""Display a completed review without copying credentials or source files."""
import json
from pathlib import Path
import re
import sys

target = sys.argv[1] if len(sys.argv) == 2 else "main"
if not re.fullmatch(r"main|pr-[1-9][0-9]*", target):
    sys.exit("Informe main ou pr-N.")
folder = Path("/var/lib/atenda-review/reports")
pointer = folder / (target + ".json")
if not pointer.exists():
    sys.exit("Ainda não há relatório para esse alvo.")
rev = json.loads(pointer.read_text())
path = folder / f"{target}-{rev['base'][:12]}-{rev['head'][:12]}.txt"
print(path.read_text(encoding="utf-8"))
