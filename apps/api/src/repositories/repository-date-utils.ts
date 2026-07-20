// Utilitario de data compartilhado entre repositorios.
// Extraido de 9 arquivos de apps/api/src/repositories que mantinham
// copias identicas desta funcao (higienizacao de codigo).

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
