import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC } from './auth.decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector, @Inject(AuthService) private auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(IS_PUBLIC, ctx.getHandler())) return true;
    const req = ctx.switchToHttp().getRequest();
    const h: string | undefined = req.headers?.authorization;
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException();
    req.user = await this.auth.authenticate(h.slice(7));
    return true;
  }
}
