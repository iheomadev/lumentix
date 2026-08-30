import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StreamingService } from './streaming.service';
import {
  DetectViewerBandwidthDto,
  DetectViewerBandwidthResponseDto,
  ManageContentDeliveryDto,
  OptimizeStreamQualityDto,
  ReportBufferingEventDto,
  ReportBufferingResponseDto,
  StreamDeliveryResponseDto,
  StreamPerformanceResponseDto,
  SwitchBitrateTierDto,
  SwitchBitrateTierResponseDto,
} from './dto/streaming.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role, Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Streaming')
@ApiBearerAuth()
@Controller('streaming')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Put('events/:eventId/delivery')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Configure CDN and playback URLs for hybrid events' })
  @ApiResponse({ status: 200, type: StreamDeliveryResponseDto })
  manageContentDelivery(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ManageContentDeliveryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamDeliveryResponseDto> {
    return this.streamingService.manageContentDelivery(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/optimize-quality')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Tune adaptive bitrate ladder for virtual attendees' })
  @ApiResponse({ status: 200, type: StreamDeliveryResponseDto })
  optimizeStreamQuality(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: OptimizeStreamQualityDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamDeliveryResponseDto> {
    return this.streamingService.optimizeStreamQuality(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Get('events/:eventId/performance')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Monitor live streaming performance metrics' })
  @ApiResponse({ status: 200, type: StreamPerformanceResponseDto })
  monitorStreamingPerformance(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamPerformanceResponseDto> {
    return this.streamingService.monitorStreamingPerformance(
      eventId,
      req.user.id,
    );
  }

  @Post('events/:eventId/detect-bandwidth')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Estimate viewer bandwidth and recommend a quality profile' })
  @ApiResponse({ status: 201, type: DetectViewerBandwidthResponseDto })
  detectViewerBandwidth(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: DetectViewerBandwidthDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DetectViewerBandwidthResponseDto> {
    return this.streamingService.detectViewerBandwidth(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/switch-bitrate')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Switch viewer to a specific bitrate tier (manual or auto)' })
  @ApiResponse({ status: 201, type: SwitchBitrateTierResponseDto })
  switchBitrateTier(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SwitchBitrateTierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SwitchBitrateTierResponseDto> {
    return this.streamingService.switchBitrateTier(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/report-buffering')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Report a buffering event and trigger adaptive quality adjustment' })
  @ApiResponse({ status: 201, type: ReportBufferingResponseDto })
  reportBufferingEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReportBufferingEventDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReportBufferingResponseDto> {
    return this.streamingService.reportBufferingEvent(
      eventId,
      req.user.id,
      dto,
    );
  }
}
