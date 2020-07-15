/// <reference types="jest" />

import boxplot from './boxplot';

describe('boxplot', () => {
  test('name', () => {
    expect(typeof boxplot).toBe('function');
  });
});
