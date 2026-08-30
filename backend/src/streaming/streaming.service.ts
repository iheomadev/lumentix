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
  ): Promise<DetectViewerBandwidthResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const sampleWindowMs = dto.sampleWindowMs ?? 5_000;
    const estimatedBandwidthKbps =
      (dto.uploadedBytes * 8) / (sampleWindowMs / 1_000) / 1_000;

    const recommendedProfile = this.profileFromBandwidth(estimatedBandwidthKbps);

    // Persist the bandwidth estimate so switchBitrateTier can use it for 'auto'
    let config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      config = this.streamingRepo.create({ eventId });
    }
    config.performanceMetrics = {
      ...config.performanceMetrics,
      [`viewer_${dto.viewerId}_bandwidthKbps`]: estimatedBandwidthKbps,
      [`viewer_${dto.viewerId}_recommendedProfile`]: recommendedProfile,
      [`viewer_${dto.viewerId}_bandwidthSampledAt`]: new Date().toISOString(),
    };
    await this.streamingRepo.save(config);

    this.logger.log(
      `Bandwidth detected for viewer ${dto.viewerId} on event ${eventId}: ${estimatedBandwidthKbps.toFixed(0)} kbps -> ${recommendedProfile}`,
    );

    return {
      viewerId: dto.viewerId,
      estimatedBandwidthKbps: Math.round(estimatedBandwidthKbps),
      recommendedProfile,
      timestamp: new Date(),
    };
  }

  async switchBitrateTier(
    eventId: string,
    organizerId: string,
    dto: SwitchBitrateTierDto,
  ): Promise<SwitchBitrateTierResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config || !config.streamUrl) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }

    const previousProfile = config.qualityProfile ?? 'auto';

    let newProfile: string;
    if (dto.targetProfile === 'auto') {
      const storedBandwidth = config.performanceMetrics[
        `viewer_${dto.viewerId}_bandwidthKbps`
      ] as number | undefined;
      newProfile = storedBandwidth != null
        ? this.profileFromBandwidth(storedBandwidth)
        : '720p';
    } else {
      newProfile = dto.targetProfile;
    }

    config.qualityProfile = newProfile;
    await this.streamingRepo.save(config);

    const cdnBaseUrl =
      config.cdnBaseUrl ??
      this.configService.get<string>('CDN_BASE_URL') ??
      'https://cdn.lumentix.local';
    const playbackUrl = `${cdnBaseUrl}/events/${eventId}/hls/${newProfile}/master.m3u8`;

    this.logger.log(
      `Bitrate tier switched for viewer ${dto.viewerId} on event ${eventId}: ${previousProfile} -> ${newProfile} (reason: ${dto.reason})`,
    );

    return {
      eventId,
      viewerId: dto.viewerId,
      previousProfile,
      newProfile,
      playbackUrl,
    };
  }

  async reportBufferingEvent(
    eventId: string,
    organizerId: string,
    dto: ReportBufferingEventDto,
  ): Promise<ReportBufferingResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      throw new NotFoundException('No streaming configuration found for this event');
    }

    const profiles = ['240p', '480p', '720p', '1080p'];
    const currentProfile = dto.currentProfile;
    const currentIdx = profiles.indexOf(currentProfile);
    const safeIdx = currentIdx >= 0 ? currentIdx : 2; // default to 720p index

    let newProfile = currentProfile;
    let action: 'downgraded' | 'maintained' | 'upgraded';
    let message: string;

    if (dto.bufferingDurationMs > 3_000) {
      // Downgrade one tier if possible
      const downIdx = Math.max(0, safeIdx - 1);
      newProfile = profiles[downIdx];
      action = newProfile !== currentProfile ? 'downgraded' : 'maintained';
      message =
        action === 'downgraded'
          ? `Quality downgraded from ${currentProfile} to ${newProfile} due to extended buffering (${dto.bufferingDurationMs}ms)`
          : `Already at lowest quality tier (${currentProfile}); cannot downgrade further`;
    } else if (dto.bufferingDurationMs <= 1_000) {
      // Try to upgrade if bandwidth estimate supports it
      const storedBandwidth = config.performanceMetrics[
        `viewer_${dto.viewerId}_bandwidthKbps`
      ] as number | undefined;

      if (storedBandwidth != null) {
        const recommendedProfile = this.profileFromBandwidth(storedBandwidth);
        const recommendedIdx = profiles.indexOf(recommendedProfile);
        const upIdx = Math.min(profiles.length - 1, safeIdx + 1);

        if (upIdx <= recommendedIdx && upIdx > safeIdx) {
          newProfile = profiles[upIdx];
          action = 'upgraded';
          message = `Quality upgraded from ${currentProfile} to ${newProfile} due to stable connection`;
        } else {
          action = 'maintained';
          message = `Bandwidth estimate does not support a higher tier; maintaining ${currentProfile}`;
        }
      } else {
        action = 'maintained';
        message = `No bandwidth estimate available; maintaining ${currentProfile}`;
      }
    } else {
      // 1000ms < bufferingDurationMs <= 3000ms — maintain
      action = 'maintained';
      message = `Buffering within acceptable range (${dto.bufferingDurationMs}ms); maintaining ${currentProfile}`;
    }

    // Increment buffering event counter and persist
    const stored = config.performanceMetrics ?? {};
    const bufferingCount = (Number(stored[`viewer_${dto.viewerId}_bufferingCount`]) || 0) + 1;
    config.performanceMetrics = {
      ...stored,
      [`viewer_${dto.viewerId}_bufferingCount`]: bufferingCount,
      [`viewer_${dto.viewerId}_lastBufferingMs`]: dto.bufferingDurationMs,
      [`viewer_${dto.viewerId}_lastBufferingAt`]: new Date().toISOString(),
    };

    if (newProfile !== currentProfile) {
      config.qualityProfile = newProfile;
    }
    await this.streamingRepo.save(config);

    this.logger.log(
      `Buffering reported by viewer ${dto.viewerId} on event ${eventId}: ${action} (${currentProfile} -> ${newProfile})`,
    );

    return {
      eventId,
      viewerId: dto.viewerId,
      action,
      newProfile,
      message,
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

  private profileFromBandwidth(bandwidthKbps: number): string {
    if (bandwidthKbps >= 4_500) return '1080p';
    if (bandwidthKbps >= 2_500) return '720p';
    if (bandwidthKbps >= 1_000) return '480p';
    return '240p';
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
