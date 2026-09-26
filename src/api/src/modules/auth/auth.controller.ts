import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { AuthRateLimit, CurrentActor, Public } from '../../core/auth/decorators.js';
import { SESSION_COOKIE } from '../../core/auth/session.guard.js';
import { AuthService, type NewSession } from './auth.service.js';
import { LoginDto, MeDto, RegisterDto } from './dto/auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Email + password login. Sets the httpOnly `session` cookie and returns the user. */
  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    return this.withCookie(req, res, await this.auth.login(dto, req.ip));
  }

  /** Creates an account (no event roles yet) and logs it in. */
  @Public()
  @AuthRateLimit()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    return this.withCookie(req, res, await this.auth.register(dto, req.ip));
  }

  /** Ends the current browser session. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    await this.auth.logout(actor, token, req.ip);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** The logged-in user and their roles per event. 401 when not logged in. */
  @Get('me')
  me(@CurrentActor() actor: Actor): MeDto {
    return this.auth.me(actor);
  }

  private withCookie(req: Request, res: Response, session: NewSession): MeDto {
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      path: '/',
      expires: session.expiresAt,
    });
    return session.me;
  }
}
