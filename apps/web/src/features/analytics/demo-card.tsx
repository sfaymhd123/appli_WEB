import { useState } from 'react';
import { Play, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  useToast,
} from '../../components/ui';
import { useRunDemo } from '../../lib/api/hooks/use-demo';
import { errorMessage } from '../../lib/api/error';
import type { DemoStep } from '../../lib/api/types/demo';

export function DemoCard() {
  const { toast } = useToast();
  const runDemo = useRunDemo();
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [showSteps, setShowSteps] = useState(false);

  async function onRun() {
    try {
      setSteps([]);
      setShowSteps(true);
      const result = await runDemo.mutateAsync();
      setSteps(result.steps);
      toast(
        `Démonstration réussie : ${result.patientName} (${result.patientId}) créée.`,
        'success',
      );
    } catch (error: any) {
      if (error.response?.data?.steps) {
        setSteps(error.response.data.steps);
      }
      toast(errorMessage(error), 'error');
    }
  }

  const isPending = runDemo.isPending;
  const isSuccess = runDemo.isSuccess;
  const isError = runDemo.isError;

  return (
    <Card className="border-clinical-200 bg-clinical-50/30 overflow-hidden">
      <CardHeader
        title={
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-clinical-600 fill-clinical-600" />
            <span>Démonstration — scénario en un clic</span>
          </div>
        }
        description="Générez instantanément le parcours complet de Fatima Zahra (M1→M6)."
        action={
          <Badge tone="clinical" className="bg-clinical-100 text-clinical-700 border-none shadow-none uppercase tracking-tighter text-[10px]">
            Dev / Demo only
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Construisez une patiente avec admission P1, plan de soins, prescriptions validées, 
          résultats bio et une **alerte en attente** prête à l'escalade (15 min).
        </p>

        <div className="pt-2">
          <Button
            onClick={onRun}
            loading={isPending}
            fullWidth
            variant={isError ? 'secondary' : 'primary'}
            className="shadow-md shadow-clinical-900/10"
          >
            {isPending ? 'Construction du scénario...' : 'Lancer le scénario'}
            {!isPending && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>

        {showSteps && (
          <div className="mt-4 rounded-xl border border-clinical-100 bg-white p-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Journal d'exécution</h4>
            <ul className="space-y-2">
              {steps.map((step) => (
                <li key={step.key} className="flex items-start gap-3 text-xs">
                  {step.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className={step.ok ? 'text-gray-700 font-medium' : 'text-red-700 font-bold'}>
                      {step.label}
                    </span>
                    {step.detail && <p className="mt-0.5 text-[10px] text-gray-400 italic">{step.detail}</p>}
                  </div>
                </li>
              ))}
              {isPending && (
                <li className="flex items-center gap-3 text-xs animate-pulse">
                  <div className="h-4 w-4 rounded-full border-2 border-clinical-200 border-t-clinical-600 animate-spin" />
                  <span className="text-clinical-600 font-medium">Étape suivante...</span>
                </li>
              )}
            </ul>
            {isSuccess && (
              <div className="pt-2 border-t border-gray-50">
                <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider text-center">
                  Scénario terminé avec succès
                </p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
