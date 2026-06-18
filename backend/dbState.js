let DB_CONNECTED = false;
/** When true, catalog (and related flows) may use embedded demo inventory. */
let SERVE_MOCK_CATALOG = false;

function setDbConnected(value) {
  DB_CONNECTED = !!value;
}

function setMockCatalog(value) {
  SERVE_MOCK_CATALOG = !!value;
}

function isDbConnected() {
  return DB_CONNECTED;
}

function shouldServeMockCatalog() {
  return SERVE_MOCK_CATALOG;
}

module.exports = {
  setDbConnected,
  setMockCatalog,
  isDbConnected,
  shouldServeMockCatalog,
};
