// Mock for drizzle-orm/mysql-core

const createMockColumn = () => {
  const mockCol = {};
  mockCol.primaryKey = jest.fn(() => mockCol);
  mockCol.notNull = jest.fn(() => mockCol);
  mockCol.default = jest.fn(() => mockCol);
  mockCol.defaultNow = jest.fn(() => mockCol);
  mockCol.references = jest.fn(() => mockCol);
  mockCol.$type = jest.fn(() => mockCol);
  mockCol.$onUpdate = jest.fn(() => mockCol);
  return mockCol;
};

module.exports = {
  mysqlTable: jest.fn((name, columns) => ({ name, columns })),
  varchar: jest.fn(() => createMockColumn()),
  text: jest.fn(() => createMockColumn()),
  tinyint: jest.fn(() => createMockColumn()),
  timestamp: jest.fn(() => createMockColumn()),
  int: jest.fn(() => createMockColumn()),
  index: jest.fn(() => ({})),
  unique: jest.fn(() => ({})),
};
