import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ProgressAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

const RESPONSE_LABEL = 'response';

export default function ProgressCompilation({ data, isStreaming = false }: { data?: ProgressAnnotation[]; isStreaming?: boolean }) {
  const [progressList, setProgressList] = React.useState<ProgressAnnotation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [latestArtifactActions, setLatestArtifactActions] = React.useState<ActionState[]>([]);

  React.useEffect(() => {
    let cleanupActionSubscription = () => {};

    const subscribeToLatestArtifact = () => {
      cleanupActionSubscription();
      setLatestArtifactActions([]);

      const artifacts = workbenchStore.artifacts.get();
      const latestArtifactId = Object.keys(artifacts).at(-1);

      if (!latestArtifactId) {
        return;
      }

      const latestArtifact = artifacts[latestArtifactId];

      if (!latestArtifact) {
        return;
      }

      const syncActions = () => {
        setLatestArtifactActions(Object.values(latestArtifact.runner.actions.get()));
      };

      syncActions();
      cleanupActionSubscription = latestArtifact.runner.actions.listen(syncActions);
    };

    const cleanupArtifactsSubscription = workbenchStore.artifacts.listen(subscribeToLatestArtifact);
    subscribeToLatestArtifact();

    return () => {
      cleanupActionSubscription();
      cleanupArtifactsSubscription();
    };
  }, []);

  React.useEffect(() => {
    if (!data || data.length == 0) {
      setProgressList([]);
      return;
    }

    const progressMap = new Map<string, ProgressAnnotation>();
    data.forEach((x) => {
      const existingProgress = progressMap.get(x.label);

      if (existingProgress && existingProgress.status === 'complete') {
        return;
      }

      progressMap.set(x.label, x);
    });

    const newData = Array.from(progressMap.values());
    const responseIndex = newData.findIndex((progress) => progress.label === RESPONSE_LABEL);

    if (responseIndex !== -1) {
      const hasActiveActions = latestArtifactActions.some((action) => action.status === 'pending' || action.status === 'running');
      const hasTrackedActions = latestArtifactActions.length > 0;

      if (hasActiveActions) {
        newData[responseIndex] = {
          ...newData[responseIndex],
          status: 'in-progress',
          message: 'Applying changes',
        };
      } else if (!isStreaming && hasTrackedActions) {
        newData[responseIndex] = {
          ...newData[responseIndex],
          status: 'complete',
          message: 'Changes applied',
        };
      } else if (!isStreaming && !hasTrackedActions) {
        newData[responseIndex] = {
          ...newData[responseIndex],
          status: 'complete',
          message: 'Response ready',
        };
      }
    }

    newData.sort((a, b) => a.order - b.order);
    setProgressList(newData);
  }, [data, isStreaming, latestArtifactActions]);

  if (progressList.length === 0) {
    return <></>;
  }

  return (
    <AnimatePresence>
      <div
        className={classNames(
          'bg-bolt-elements-background-depth-2',
          'border border-bolt-elements-borderColor',
          'shadow-lg rounded-lg  relative w-full max-w-chat mx-auto z-prompt',
          'p-1',
        )}
      >
        <div
          className={classNames(
            'bg-bolt-elements-item-backgroundAccent',
            'p-1 rounded-lg text-bolt-elements-item-contentAccent',
            'flex ',
          )}
        >
          <div className="flex-1">
            <AnimatePresence>
              {expanded ? (
                <motion.div
                  className="actions"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: '0px' }}
                  transition={{ duration: 0.15 }}
                >
                  {progressList.map((x, i) => {
                    return <ProgressItem key={i} progress={x} />;
                  })}
                </motion.div>
              ) : (
                <ProgressItem progress={progressList.slice(-1)[0]} />
              )}
            </AnimatePresence>
          </div>
          <motion.button
            initial={{ width: 0 }}
            animate={{ width: 'auto' }}
            exit={{ width: 0 }}
            transition={{ duration: 0.15, ease: cubicEasingFn }}
            className=" p-1 rounded-lg bg-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-artifacts-backgroundHover"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className={expanded ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'}></div>
          </motion.button>
        </div>
      </div>
    </AnimatePresence>
  );
}

const ProgressItem = ({ progress }: { progress: ProgressAnnotation }) => {
  return (
    <motion.div
      className={classNames('flex text-sm gap-3')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-1.5 ">
        <div>
          {progress.status === 'in-progress' ? (
            <div className="i-svg-spinners:90-ring-with-bg"></div>
          ) : progress.status === 'complete' ? (
            <div className="i-ph:check"></div>
          ) : null}
        </div>
        {/* {x.label} */}
      </div>
      {progress.message}
    </motion.div>
  );
};
