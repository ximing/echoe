// Mock for drizzle-orm
module.exports = {
  and: jest.fn((...args) => args),
  eq: jest.fn((col, val) => ({ col, val })),
  isNull: jest.fn((col) => ({ col, op: 'isNull' })),
  desc: jest.fn((col) => ({ col, dir: 'DESC' })),
  asc: jest.fn((col) => ({ col, dir: 'ASC' })),
  sql: jest.fn(() => ({ toSQL: () => ({}) })),
};
