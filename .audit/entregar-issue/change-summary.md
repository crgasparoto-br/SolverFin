# Change summary — issue #598 post-CI refreeze

Material head: `33955a3de2c12d53703229ebdd2f63e5ce7bb5c7`

- Financial E2E cleanup was corrected so PostgreSQL cleanup binds exactly the parameters used by each statement.
- The financial invariant test was formatted and the temporary Prettier diagnostic was removed.
- Two unrelated visual-test races discovered by the required repository-wide visual workflow were synchronized without weakening assertions.
- CI run 4343 and Statement visual validation run 2858 both completed successfully on the material head.
- No production financial implementation path was changed by the CI remediation.
