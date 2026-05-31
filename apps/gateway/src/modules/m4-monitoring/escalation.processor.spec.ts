import type { Job } from 'bullmq';

import { ESCALATION_JOB, type EscalationJobData } from '../../core/events';
import { EscalationProcessor } from './escalation.processor';
import type { M4MonitoringService } from './m4-monitoring.service';

/**
 * The BullMQ worker is the trigger for the §8 flagship guarantee — when the
 * 15-min timer fires it must hand the alert to M4MonitoringService.runEscalation
 * (which decides escalate-vs-noop), and it must ignore any stray job name without
 * touching the alert.
 */
describe('EscalationProcessor', () => {
  function makeProcessor() {
    const runEscalation = jest.fn().mockResolvedValue(undefined);
    const monitoring = { runEscalation } as unknown as M4MonitoringService;
    return { processor: new EscalationProcessor(monitoring), runEscalation };
  }

  const job = (name: string, detectedIssueId = 'di-1'): Job<EscalationJobData> =>
    ({ name, data: { detectedIssueId } }) as unknown as Job<EscalationJobData>;

  it('delegates an escalation job to runEscalation with the alert id', async () => {
    const { processor, runEscalation } = makeProcessor();
    await processor.process(job(ESCALATION_JOB, 'di-42'));
    expect(runEscalation).toHaveBeenCalledTimes(1);
    expect(runEscalation).toHaveBeenCalledWith('di-42');
  });

  it('ignores an unexpected job name without escalating', async () => {
    const { processor, runEscalation } = makeProcessor();
    await processor.process(job('some-other-job'));
    expect(runEscalation).not.toHaveBeenCalled();
  });
});
