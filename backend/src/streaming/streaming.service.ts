import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { StreamingConfig } from './entities/streaming-config.entity';
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

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    @InjectRepository(StreamingConfig)
    private readonly streamingRepo: Repository<StreamingConfig>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly configService: ConfigService,
  ) {}

  async manageContentDelivery(
    eventId: string,
    organizerId: string,
    dto: ManageContentDeliveryDto,
  ): Promise<StreamDeliveryResponseDto> {
    const event = await this.requireOrganizerEvent(eventId, organizerId);

    let config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      config = this.streamingRepo.create({ eventId });
    }

    config.cdnBaseUrl = dto.cdnBaseUrl;
    config.streamUrl = dto.streamUrl;
    config.qualityProfile = dto.qualityProfile ?? 'auto';
    config.adaptiveBitrate = dto.adaptiveBitrate ?? true;
    config.deliveryConfig = {
      ...config.deliveryConfig,
      eventTitle: event.title,
      signedUrls: true,
      protocol: 'hls',
    };

    const saved = await this.streamingRepo.save(config);
    this.logger.log(`Content delivery configured for event ${eventId}`);

    return this.toDeliveryResponse(saved);
  }

  async optimizeStreamQuality(
    eventId: string,
    organizerId: string,
    dto: OptimizeStreamQualityDto,
  ): Promise<StreamDeliveryResponseDto> {
    const event = await this.requireOrganizerEvent(eventId, organizerId);
    let config = await this.streamingRepo.findOne({ where: { eventId } });

    if (!config || !config.streamUrl) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }

    const qualityProfile = this.resolveQualityProfile(dto.targetBitrateKbps);
    config.targetBitrateKbps = dto.targetBitrateKbps;
    config.qualityProfile = qualityProfile;
    config.adaptiveBitrate = true;
    config.deliveryConfig = {
      ...config.deliveryConfig,
      ladder: this.buildAdaptiveLadder(dto.targetBitrateKbps),
      eventTitle: event.title,
    };

    const saved = await this.streamingRepo.save(config);
    this.logger.log(
      `Optimized stream quality for event ${eventId} to ${qualityProfile}`,
    );

    return this.toDeliveryResponse(saved);
  }

  async monitorStreamingPerformance(
    eventId: string,
    organizerId: string,
  ): Promise<StreamPerformanceResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      throw new NotFoundException('No streaming configuration found for this event');
    }

    const stored = config.performanceMetrics ?? {};
    const avgBitrateKbps =
      Number(stored.avgBitrateKbps) || config.targetBitrateKbps || 2_500;
    const rebufferRatioPercent = Number(stored.rebufferRatioPercent) || 0.5;
    const concurrentViewers = Number(stored.concurrentViewers) || 0;
    const qualityScore = this.calculateQualityScore(rebufferRatioPercent);

    const metrics: StreamPerformanceResponseDto = {
      eventId,
      avgBitrateKbps,
      rebufferRatioPercent,
      concurrentViewers,
      qualityScore,
      healthStatus: this.healthFromScore(qualityScore),
      lastMeasuredAt: config.updatedAt,
    };

    config.performanceMetrics = {
      ...stored,
      ...metrics,
      sampledAt: new Date().toISOString(),
    };
    await this.streamingRepo.save(config);

    return metrics;
  }

  async detectViewerBandwidth(
    eventId: string,
    organizerId: string,
    dto: DetectViewerBandwidthDto,
  ): Promise<BandwidthDetectionResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const config = await this.streamingRepo.findOne({ where: { eventId } });

    // Use stored target bitrate as a baseline; default to 2500kbps for auto
    const baselineBitrateKbps = config?.targetBitrateKbps ?? 2_500;

    // Simulate bandwidth detection using adaptive ladder metrics
    // In production this would use a probe segment download test
    const stored = config?.performanceMetrics ?? {};
    const avgBitrateKbps = Number(stored.avgBitrateKbps) || baselineBitrateKbps;
    const rebufferRatio = Number(stored.rebufferRatioPercent) || 0;

    // Estimate available bandwidth: if rebuffering is high, bandwidth < stream bitrate
    const bandwidthFactor = rebufferRatio > 2 ? 0.7 : rebufferRatio > 0.5 ? 0.9 : 1.1;
    const estimatedBandwidthKbps = Math.round(avgBitrateKbps * bandwidthFactor);

    const recommendedTier = this.tierFromBandwidth(estimatedBandwidthKbps);
    const recommendedBitrateKbps = this.bitrateForTier(recommendedTier);

    this.logger.log(
      `Detected viewer bandwidth ~${estimatedBandwidthKbps}kbps for event ${eventId}, recommending ${recommendedTier}`,
    );

    return { eventId, estimatedBandwidthKbps, recommendedTier, recommendedBitrateKbps };
  }

  async switchBitrateTier(
    eventId: string,
    organizerId: string,
    dto: SwitchBitrateTierDto,
  ): Promise<BitrateSwitchResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    let config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }

    const previousTier = config.qualityProfile ?? 'auto';
    const newTier = dto.tier === 'auto' ? this.resolveQualityProfile(config.targetBitrateKbps) : dto.tier;
    const newBitrateKbps = this.bitrateForTier(newTier);

    config.qualityProfile = newTier;
    config.targetBitrateKbps = newBitrateKbps;
    config.adaptiveBitrate = dto.tier === 'auto';
    config.deliveryConfig = {
      ...config.deliveryConfig,
      lastManualSwitch: new Date().toISOString(),
      switchReason: 'manual',
    };

    await this.streamingRepo.save(config);
    this.logger.log(`Switched bitrate tier for event ${eventId}: ${previousTier} -> ${newTier}`);

    return {
      eventId,
      previousTier,
      newTier,
      newBitrateKbps,
      switchedAt: new Date(),
    };
  }

  async reportBufferingEvent(
    eventId: string,
    organizerId: string,
    dto: ReportBufferingEventDto,
  ): Promise<BufferingEventResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    let config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }

    const stored = config.performanceMetrics ?? {};
    const totalBufferingMs =
      Number(stored.totalBufferingMs ?? 0) + dto.bufferingDurationMs;
    const bufferingEventCount = Number(stored.bufferingEventCount ?? 0) + 1;

    // Recalculate rebuffer ratio: total buffering / assumed 10min session (600000ms)
    const sessionDurationMs = 600_000;
    const updatedRebufferRatioPercent = parseFloat(
      ((totalBufferingMs / sessionDurationMs) * 100).toFixed(2),
    );

    config.performanceMetrics = {
      ...stored,
      totalBufferingMs,
      bufferingEventCount,
      rebufferRatioPercent: updatedRebufferRatioPercent,
      lastBufferingAt: new Date().toISOString(),
      ...(dto.currentBitrateKbps !== undefined && {
        avgBitrateKbps: dto.currentBitrateKbps,
      }),
    };

    await this.streamingRepo.save(config);
    this.logger.log(
      `Buffering event reported for event ${eventId}: ${dto.bufferingDurationMs}ms, new rebuffer ratio: ${updatedRebufferRatioPercent}%`,
    );

    return {
      eventId,
      bufferingDurationMs: dto.bufferingDurationMs,
      reportedAt: new Date(),
      updatedRebufferRatioPercent,
    };
  }

  private async requireOrganizerEvent(
    eventId: string,
    organizerId: string,
  ): Promise<Event> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }
    return event;
  }

  private resolveQualityProfile(targetBitrateKbps: number): string {
    if (targetBitrateKbps >= 4_500) return '1080p';
    if (targetBitrateKbps >= 2_500) return '720p';
    return '480p';
  }

  private buildAdaptiveLadder(targetBitrateKbps: number): Array<{
    profile: string;
    bitrateKbps: number;
  }> {
    const peak = Math.max(targetBitrateKbps, 1_500);
    return [
      { profile: '1080p', bitrateKbps: Math.round(peak) },
      { profile: '720p', bitrateKbps: Math.round(peak * 0.55) },
      { profile: '480p', bitrateKbps: Math.round(peak * 0.3) },
    ];
  }

  private calculateQualityScore(rebufferRatioPercent: number): number {
    if (rebufferRatioPercent <= 0.5) return 95;
    if (rebufferRatioPercent <= 1.5) return 85;
    if (rebufferRatioPercent <= 3) return 70;
    return 50;
  }

  private healthFromScore(
    score: number,
  ): StreamPerformanceResponseDto['healthStatus'] {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'degraded';
    return 'poor';
  }

  private tierFromBandwidth(bandwidthKbps: number): string {
    if (bandwidthKbps >= 4_500) return '1080p';
    if (bandwidthKbps >= 2_500) return '720p';
    if (bandwidthKbps >= 1_000) return '480p';
    return '360p';
  }

  private bitrateForTier(tier: string): number {
    const map: Record<string, number> = {
      '1080p': 5_000,
      '720p': 2_500,
      '480p': 1_000,
      '360p': 600,
      auto: 2_500,
    };
    return map[tier] ?? 2_500;
  }

  private toDeliveryResponse(config: StreamingConfig): StreamDeliveryResponseDto {
    const cdn =
      config.cdnBaseUrl ??
      this.configService.get<string>('CDN_BASE_URL') ??
      'https://cdn.lumentix.local';
    const streamUrl = config.streamUrl ?? '';

    return {
      eventId: config.eventId,
      cdnBaseUrl: cdn,
      streamUrl,
      qualityProfile: config.qualityProfile,
      adaptiveBitrate: config.adaptiveBitrate,
      targetBitrateKbps: config.targetBitrateKbps,
      playbackUrl: streamUrl || `${cdn}/events/${config.eventId}/master.m3u8`,
    };
  }
}
