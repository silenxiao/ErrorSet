# 扫描 mobile src 中的 emoji 残留。
import glob
import os
import re

os.chdir(os.path.join(os.path.dirname(__file__), "..", "mobile", "src"))
pat = re.compile(
    "[\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF\u2304\u25BE\u203A\u270E\uFF0B]"
)
hits = []
for f in glob.glob("app/**/*.tsx", recursive=True) + glob.glob(
    "components/**/*.tsx", recursive=True
):
    for i, line in enumerate(open(f, encoding="utf-8"), 1):
        if pat.search(line):
            hits.append(f"{f}:{i}: {line.strip()[:80]}")
print("EMOJI LEFT:", hits if hits else "none")
