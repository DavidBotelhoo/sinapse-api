import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import type { Env } from '../../config/env';
import { MeResponseDto } from '../users/dto/me-response.dto';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { SessionContext } from './token.service';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAccessCookie,
  setRefreshCookie,
} from './cookies.util';

const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
@Public()
export class AuthController {
  private readonly cookieCfg: { nodeEnv: string; cookieDomain: string };

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieCfg = {
      nodeEnv: config.get('NODE_ENV', { infer: true }),
      cookieDomain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  @Post('register')
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponseDto> {
    const result = await this.auth.register(dto, this.ctxFromRequest(req));
    this.writeCookies(res, result.tokens);
    return result.user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponseDto> {
    const result = await this.auth.login(dto, this.ctxFromRequest(req));
    this.writeCookies(res, result.tokens);
    return result.user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiNoContentResponse({ description: 'Cookies rotacionados.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = this.readRefreshCookie(req);
    const tokens = await this.auth.refresh(raw, this.ctxFromRequest(req));
    this.writeCookies(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sessao encerrada.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = this.readRefreshCookie(req);
    await this.auth.logout(raw);
    clearAuthCookies(res, this.cookieCfg);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiNoContentResponse({ description: 'Pedido recebido (resposta uniforme).' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse({ description: 'Senha redefinida.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  private writeCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  ): void {
    setAccessCookie(res, tokens.accessToken, this.cookieCfg, ACCESS_COOKIE_MAX_AGE_MS);
    setRefreshCookie(res, tokens.refreshToken, this.cookieCfg, tokens.refreshExpiresAt);
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[REFRESH_COOKIE];
  }

  private ctxFromRequest(req: Request): SessionContext {
    return {
      userAgent: req.get('user-agent') ?? null,
      ip: req.ip ?? null,
    };
  }
}

// Export para outros modulos lerem o cookie de access do request autenticado.
export { ACCESS_COOKIE };
