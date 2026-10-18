# E-09 roster preflight increment

A pure roster validator checks stable identities, supported competition roles,
single-role exclusivity, and team/judge separation before submission. It
does not create or authorize users and does not persist assignments.

E-09 remains incomplete: authenticated tenant membership, durable assignment
revisions, scheduling/conflict constraints, judge independence, casting UI,
real PostgreSQL tests, accessibility and browser acceptance remain pending.
Never authorize assignments based on caller-controlled role claims.
