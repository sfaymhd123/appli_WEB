import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ALERT_ESCALATION_QUEUE, ESCALATION_JOB, type EscalationJobData } from '../../core/events';
import { M4MonitoringService } from './m4-monitoring.service';

/**
 * BullMQ worker for the 15-min escalation timer (CLAUDE.md §8). When a delayed
 * job fires, it hands off to M4MonitoringService.runEscalation, which re-reads
 * the DetectedIssue and only escalates if it is still Pending. The flagship
 * safety guarantee: no high/critical alert is ever silently lost.
 */
@Processor(ALERT_ESCALATION_QUEUE)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(private readonly monitoring: M4MonitoringService) {
    super();
  }

  async process(job: Job<EscalationJobData>): Promise<void> {
    if (job.name !== ESCALATION_JOB) {
      this.logger.warn(`Ignoring unexpected job '${job.name}' on ${ALERT_ESCALATION_QUEUE}`);
      return;
    }
    await this.monitoring.runEscalation(job.data.detectedIssueId);
  }
}
