/**
 * Los tests cubren solo `src/core`: lógica pura, sin React Native ni Expo.
 * Cuando haya que testear componentes o la capa de datos se añadirá el
 * preset `jest-expo` en un segundo proyecto.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/core/**/*.test.ts',
    '<rootDir>/src/dev/**/*.test.ts',
    // Solo lógica pura de la capa de datos (p. ej. `pendingMigrations`), no
    // tests que importen expo-sqlite — para eso haría falta el preset jest-expo.
    '<rootDir>/src/db/**/*.test.ts',
  ],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { caller: { platform: 'node' } }],
  },
};
