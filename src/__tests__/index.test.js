import JsonWebToken from '../JsonWebToken';

describe('jwt', () => {
  it('is required', () => {
    expect(() => new JsonWebToken()).toThrowError(new TypeError('PRIVATE_KEY or JWT_SECRET least one is required'));
  });

  it('use JWT_SECRET to sign & verify', async () => {
    const jwt = new JsonWebToken({ JWT_SECRET: 'XYZ' });
    expect(jwt).toMatchSnapshot();
    const { data } = jwt.verify(jwt.sign({ id: '10' }));
    expect(data.id).toBe('10');
  });

  it('use PRIVATE_KEY to sign & verify', async () => {
    const PRIVATE_KEY = 'LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFb3dJQkFBS0NBUUVBc0RWMnB6azIydTRGTGtyTW9TSjZpQnEwQmxSS1dVMSsxc0VrSG5ycWNsNUhxeEp4CmR4elBkS1dBRTV6TVJqeUlRTTlKSWcxTEllVGkzNE1paGRrbjNHaHIydXVtOWk0eXJ3VVZpRVBDbWNxS0JsekoKYjB2a3YrRUZYcHc4VVhJblFMZzlyWkdkZlFQTUtUUlVJYVNFYmxMcE5tTjJ6MGJ5L1M4aXBIN3QrelRablRkZgoyQVBQN3U5NGpEaVA2QWc1ZHlGaUpVejRlQTNEZUlUbkZwMjE4N1VTZkJMUTFmSVB2NXNtM2RJSkZWUFhwNHFKClM0R3BiRDhIamxKUEdXdFhwRHRDeFlvTkFHbGRiY3VEcTY0VGJWTEFBTHlZcXFMVkV6bmpOdUdwc0N0S0dva2oKSjJoRlZDbXQwQ0JGSWxJQnRiZVBSaC94Q05kdzRLMFJzN0ozc3dJREFRQUJBb0lCQURwZEN2YnFhWFBzUUlVTAp1MmxuclNRbGpCbElrL091U21QQlIwQmRRQWd2bUJkZW5YeHhhM2xjVSthckdiSHQzTWR5b091SmNhaEJVcS9yCmxHUzIvNC91ZWtMaHFNU0Rtc0FEdEJVVk5JQ1I2Rk9oS2dzV0hTYzgxZlYzVkRjNTB5eUptY3hDbmVKSmZyYnIKSVM2ZmVrbThab2hnTzNyK0tmK1lQQ1kxOEljeWRqb2FwVmJ0MTlpdmUxb1dIblIyWkNVQk05WlF2RklzZTlRZgpncFk3Ly96QjlxRUlqMEMzMGsxT0tMd1k3WnAxUWlhMUl0TzYwYzdrVzFNZlVGL3VMZ3dldld4STZ1SnNWaFNYCk5sd3hsTzgvTkhHazE2bEMyZWtEM2pWcWpjSHdDcCt2VjFRdkFaUElvOUVEMGozVFlhZFRiWDcwQjNGRS9uU0YKL2R3am4xa0NnWUVBMzhwTG1DWTFxdGZ6MGdCUWJrNnA1a0ZsaktGOGd3QlhPWkM0TnJCU0F5bFgyK3dUWFdTTQpGVTRMNHJlL0EzMTlHVkYvT2RlQitDOERXVFVtQ1Y5SHZYaDNPQzA5VGlEekFoYWdPOTlaMWF0cFc4c2xaa2ZICk9TU01nNmxjUFd3em5WRW5FNUJZRGdMKzJFamtlR1pJZjR2NWpiem44N044cGRWM1d0L1pRTThDZ1lFQXlaSC8KNndKVUlmaFcvWUVyVCtHbTl5Vk5KNUZHa0FRRmxBZGo0bDhTT2ZVMTBZbzlqVUZvOWpoVkhNRng1MDJUeGZGNgphL2lodzF0NE04OFdnZlFKekdoTjBWQmVIWVhnZDlpWk9DckZoQUJNR3ltZzhrYWVTd1RwRkt4SUFDeEQycGgyCjNVWHJxOHFkRHVWRVVzaG1yc1R1Vm11dWlGRERDZHg5bzBYQmE5MENnWUVBczhWbjhITlJUVXBvL050dndRekUKQXNtcDc4eVJueEtZL3c4NFRBWmIrMW9zeitmV3JvRmszb0J4bjlDSFN5QjFhKzlCeW85S1FycFJjRW4zb2pPKwpCNEJNRlA2U2JyNmRONkpCV1pkVUxRYWpmaSswZlhOUG9LR3hsdHBuMUplazVzMFlIT2twTXloSTNDbkNEczNyCmt6bzRZQm5PSXNDZWN3RUYvaVF2KzVVQ2dZQnI3YXZkRnRNYm1WQml6bzMxYUxxdzdKMGlTWXhCd3BXR0RHcjAKSTdtcnBOdGJSaXpzL0pBSi9tRzhVdXY5VUxHR05HVTdlTmFNdHVabXYwU3E4cE5vaXBUWU5iTWZGYmI2Rk5UOQptUkZITzYyRWdjYTIwdzhnMWhGRFMzZ0Y5NjJoVnkrV0RVRkNLK3ZxdE9IZmZZUlZvZ2FINllKN1pOcjU1Y0N6CjhyNjlWUUtCZ0gyb2FMMURHNnlMc1hzYjVsa2Jvb3BtMUVNdjhQMWQ1cy9XOVlNSy9oZWRtSTY1TmN1a0hVNkQKdGpZa25xaWliL1ZYNTAyWmIvTkFxY1ZEYXRMMXJqbVFnalUvVnBSYlNEQ2NRek5OTmhpN1phWldHZXovbWE4QQpXcEhVWXdZSzlBZSsvMnRTQWFZaHJ4M0s2VWM0clFwK0cwS3c1blRsZlV3V2srTVltSEpoCi0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0t';

    const jwt = new JsonWebToken({ PRIVATE_KEY });
    expect(jwt).toMatchSnapshot();
    const { data } = jwt.verify(jwt.sign({ id: '10', acr: 'NONO' }));
    expect(data.id).toBe('10');
  });

  it('setup JWT_ISSUER, JWT_EXPIRES_IN and JWT_AUDIENCE', () => {
    const jwt = new JsonWebToken({
      JWT_SECRET: 'XYZ',
      JWT_ISSUER: 'tester',
      JWT_EXPIRES_IN: 24 * 60 * 60,
      JWT_AUDIENCE: 'for_tester',
    });
    expect(jwt).toMatchSnapshot();
  });

  it('generate key', () => {
    const key = JsonWebToken.generateKey();

    const jwt = new JsonWebToken({ PRIVATE_KEY: key });
    const { data } = jwt.verify(jwt.sign({ id: '10' }));
    expect(data.id).toBe('10');
  });
});
