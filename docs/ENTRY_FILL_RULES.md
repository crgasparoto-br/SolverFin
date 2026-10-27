# Regras de preenchimento manual

Nos formulários **Novo lançamento** do Extrato e **Registrar compra** do cartão, **Salvar regra** grava uma associação entre a descrição digitada e a categoria selecionada. As regras ficam persistidas no perfil financeiro autenticado, por meio de `GET /api/automation-rules?status=all` e `POST /api/automation-rules/manual-entry`, sem depender do armazenamento local do navegador.

Ao digitar pelo menos dois caracteres no campo **Descrição**, o campo sugere descrições salvas que **começam** pelo texto digitado. A busca ignora diferenças de maiúsculas e acentuação. Ao selecionar uma sugestão por mouse ou teclado, a descrição completa é preenchida e a categoria correspondente é selecionada, se continuar disponível; categorias indisponíveis nunca são selecionadas silenciosamente. O usuário pode alterar ambos os campos antes de salvar o lançamento.

A implementação reutiliza a entidade de automações do produto com um marcador de origem no nome (`Preenchimento: `) e `status=inactive`. Essas entradas são destinadas **somente** ao preenchimento manual da interface. **Não** são aplicadas à classificação automática de transações, importações, contas ou cartões. As automações ativas existentes mantêm o comportamento anterior. Uma nova gravação da mesma descrição normalizada é conciliada atomicamente no servidor, inclusive com mais de uma aba aberta ou quando a consulta inicial falha, atualizando a associação existente em vez de duplicá-la. A API valida a categoria ativa do perfil e impede que entradas de preenchimento manual sejam ativadas como automações.

**Salvar e continuar** no Extrato confirma primeiro a gravação pela API, preserva o contexto da conta, tipo, situação e datas, e somente então limpa os demais campos para o próximo registro. A listagem é recarregada ao fechar o diálogo quando houver gravações na sessão. Em edição, o botão não aparece. O botão dos cartões conserva seu comportamento anterior.

Acesso, escopo de perfil financeiro, validação de categoria e persistência continuam controlados pela API existente. A interface não cria regras de transferência automática nem altera cálculo, câmbio ou saldo.
