-- E02: namespace only. No participant, ballot, payment or competition data exists yet.
CREATE SCHEMA IF NOT EXISTS lde;
REVOKE ALL ON SCHEMA lde FROM PUBLIC;
COMMENT ON SCHEMA lde IS 'Live Debate Engine application schema; pre-release foundation';
