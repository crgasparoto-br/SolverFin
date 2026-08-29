#!/usr/bin/env python3
import argparse, hashlib, re, sys
from pathlib import Path

SHA_RE = re.compile(r"\b[0-9a-f]{40}\b")
CURRENT_RE = re.compile(r"(?i)(?:material SHA|material head|exact(?:-head)? candidate|candidate SHA|subject SHA)\s*[:=]?\s*([0-9a-f]{40})")
ANCESTOR_CONTEXT_RE = re.compile(r"(?i)(stale|ancestor|prior|previous|earlier|rejected|historical)")


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--expected-sha', required=True)
    p.add_argument('--evidence-file', required=True)
    p.add_argument('--expected-sha256')
    args = p.parse_args()
    expected = args.expected_sha.lower()
    path = Path(args.evidence_file)
    data = path.read_bytes()
    text = data.decode('utf-8')
    actual_hash = hashlib.sha256(data).hexdigest()
    if args.expected_sha256 and actual_hash != args.expected_sha256.lower():
        print(f'REJECT hash-mismatch expected={args.expected_sha256.lower()} actual={actual_hash}')
        return 3
    current_claims = []
    for lineno, line in enumerate(text.splitlines(), 1):
        m = CURRENT_RE.search(line)
        if not m:
            continue
        sha = m.group(1).lower()
        if sha != expected and not ANCESTOR_CONTEXT_RE.search(line):
            print(f'REJECT subject-mismatch line={lineno} claimed={sha} expected={expected}')
            return 2
        current_claims.append((lineno, sha, line.strip()))
    if not current_claims:
        print('REJECT no-subject-claim')
        return 4
    if not any(sha == expected for _, sha, _ in current_claims):
        print(f'REJECT no-current-subject expected={expected}')
        return 5
    print(f'PASS subject={expected} sha256={actual_hash} current_claims={len(current_claims)}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
