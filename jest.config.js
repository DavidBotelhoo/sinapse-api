/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['/node_modules/', '/src/generated/', 'main.ts'],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  // Transforma tambem pacotes ESM do Nest que o Jest nao digere direto.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/)?(@nestjs|bullmq|ioredis|@aws-sdk)|.*/node_modules/(?!@nestjs|bullmq|ioredis))',
  ],
};
