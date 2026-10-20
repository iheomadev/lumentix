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
  BandwidthDetectionResponseDto,
  BitrateSwitchResponseDto,
  BufferingEventResponseDto,
  DetectViewerBandwidthDto,
  ManageContentDeliveryDto,
  OptimizeStreamQualityDto,
  ReportBufferingEventDto,
  StreamDeliveryResponseDto,
  StreamPerformanceResponseDto,
  SwitchBitrateTierDto,
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
  @ApiOperation({
    summary: 'Configure CDN and playback URLs for hybrid events',
  })
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
  @ApiOperation({
    summary: 'Tune adaptive bitrate ladder for virtual attendees',
  })
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
  @ApiOperation({
    summary: 'Detect viewer bandwidth and get recommended bitrate tier',
  })
  @ApiResponse({ status: 201, type: BandwidthDetectionResponseDto })
  detectViewerBandwidth(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: DetectViewerBandwidthDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BandwidthDetectionResponseDto> {
    return this.streamingService.detectViewerBandwidth(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/switch-bitrate')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Switch to a specific bitrate tier for stream quality control',
  })
  @ApiResponse({ status: 201, type: BitrateSwitchResponseDto })
  switchBitrateTier(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SwitchBitrateTierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BitrateSwitchResponseDto> {
    return this.streamingService.switchBitrateTier(eventId, req.user.id, dto);
  }

  @Post('events/:eventId/buffering-event')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Report a buffering event to update streaming performance metrics',
  })
  @ApiResponse({ status: 201, type: BufferingEventResponseDto })
  reportBufferingEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReportBufferingEventDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BufferingEventResponseDto> {
    return this.streamingService.reportBufferingEvent(
      eventId,
      req.user.id,
      dto,
    );
  }
}
