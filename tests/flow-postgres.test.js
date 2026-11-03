// Run the same behavioral suite against PostgreSQL as well as the SQLite run.
process.env.STAFF_TEST_DATABASE='postgres';
await import('./flow.test.js');
