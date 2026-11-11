import subprocess
base='99eced51cc2f9262bb9990f032ff786293f232bf';head='906178554d2cb8ee7d9e88c7eb014356add21950'
paths=subprocess.check_output(['git','diff','--name-only',base+'..'+head],text=True).splitlines()
expect='scripts/statement-visual/issue-662-card-installment-purchase.mjs'
assert paths==[expect],f'Unexpected code/doc/runtime change: {paths}'
print('PASS: exact SHA scope limited to Chrome test script')
print('BASE '+base);print('HEAD '+head);print('CHANGED '+expect)
print('NEGATIVE: any product, financial, documentation, or gate path would be rejected')
