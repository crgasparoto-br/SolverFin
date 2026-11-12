from pathlib import Path
from bs4 import BeautifulSoup
import re
source=Path('scripts/statement-visual/issue-662-card-installment-purchase.mjs').read_text()
match=re.search(r'\[data-purchase-item\]:has\(\[data-edit-purchase="\$\{fixture.transactionId\}"\]\) \.installment-assistive-text',source)
assert match is not None, 'The current source no longer scopes readiness to the fixture transaction'
selector='[data-purchase-item]:has([data-edit-purchase="target"]) .installment-assistive-text'
soup=BeautifulSoup('''<div data-purchase-item><button data-edit-purchase="other"></button><span class="installment-assistive-text">decoy already ready</span></div><div data-purchase-item><button data-edit-purchase="target"></button></div>''','html.parser')
assert len(soup.select('.installment-assistive-text'))==1
assert len(soup.select(selector))==0, 'False positive: wrong purchase row satisfies readiness'
row=soup.select_one('[data-edit-purchase="target"]').parent
span=soup.new_tag('span');span['class']='installment-assistive-text';span.string='target ready later';row.append(span)
assert len(soup.select(selector))==1
assert soup.select_one(selector).text=='target ready later'
assert len(soup.select('[data-purchase-item]:has([data-edit-purchase="absent"]) .installment-assistive-text'))==0
print('PASS: decoy cannot satisfy readiness; asynchronously inserted target is selected; absent purchase is rejected')
