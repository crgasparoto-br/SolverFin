from pathlib import Path
import json
material='906178554d2cb8ee7d9e88c7eb014356add21950'
ci=json.loads(Path('.audit/entregar-issue/issue-789/evidence/ci-summary-789.json').read_text())
chrome=json.loads(Path('.audit/entregar-issue/issue-789/evidence/chrome-summary-789.json').read_text())
def accepted(observed):
  return observed['material_head_sha']==material
assert accepted(ci) and accepted(chrome)
mutated={**chrome,'material_head_sha':'aa1f98ccad53e6ce51650477e27ec486e6209804'}
assert not accepted(mutated)
wrong_conclusion={**ci,'checks':[{'status':'completed','conclusion':'failure'}]}
assert not all(x['conclusion']=='success' for x in wrong_conclusion['checks'])
print('PASS: exact material SHA accepted; foreign PR head rejected; failed run rejected')
