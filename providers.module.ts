import { Global, Module } from '@nestjs/common';
import { FakePayments, FakeSms } from './fake.adapters';
import { PAYMENTS_PORT, SMS_PORT } from './ports';

// Choose adapters by env (SMS_PROVIDER / PAYMENTS_PROVIDER); register real ones here later.
@Global()
@Module({
  providers: [
    { provide: SMS_PORT, useClass: FakeSms },
    { provide: PAYMENTS_PORT, useClass: FakePayments },
  ],
  exports: [SMS_PORT, PAYMENTS_PORT],
})
export class ProvidersModule {}
