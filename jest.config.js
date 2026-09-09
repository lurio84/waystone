/**
 * Los tests cubren solo `src/core`: lógica pura, sin React Native ni Expo.
 * Cuando haya que testear componentes o la capa de datos se añadirá el
 * preset `jest-expo` en un segundo proyecto.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/core/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { caller: { platform: 'node' } }],
  },
};
