import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/rbac';
import { Public } from '../auth/auth.decorators';
import { IdentityVerificationService } from './identity.service';

@Controller()
export class IdentityController {
  constructor(@Inject(IdentityVerificationService) private svc: IdentityVerificationService) {}

  @Post('me/verification') @HttpCode(200) start(@Req() req: any) { return this.svc.start(req.user.id); }
  @Get('me/verification') status(@Req() req: any) { return this.svc.status(req.user.id); }

  /** Vendor callback: public, but the adapter must verify the vendor's signature over the raw body. */
  @Public() @Post('webhooks/identity/:provider') @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: any) {
    if (!req.rawBody) throw new BadRequestException('raw body unavailable');
    return this.svc.handleWebhook(provider, req.headers, req.rawBody.toString('utf8'));
  }

  @Get('admin/verifications/queue') @Roles('reviewer')
  queue(@Req() req: any) { return this.svc.queue(req.user.id); }

  @Post('admin/verifications/:id/decision') @HttpCode(200) @Roles('reviewer')
  decide(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() b: any) {
    if (b?.decision !== 'approve' && b?.decision !== 'reject') throw new BadRequestException('decision must be approve or reject');
    return this.svc.decide(id, req.user.id, b.decision, typeof b.reasonCode === 'string' ? b.reasonCode : undefined);
  }
}
