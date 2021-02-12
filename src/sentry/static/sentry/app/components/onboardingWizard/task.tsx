import React from 'react';
import * as ReactRouter from 'react-router';
import styled from '@emotion/styled';
import {motion} from 'framer-motion';
import moment from 'moment';

import {navigateTo} from 'app/actionCreators/navigation';
import Avatar from 'app/components/avatar';
import Button from 'app/components/button';
import Card from 'app/components/card';
import LetterAvatar from 'app/components/letterAvatar';
import Tooltip from 'app/components/tooltip';
import {IconCheckmark, IconClose, IconEvent, IconLock} from 'app/icons';
import {t, tct} from 'app/locale';
import space from 'app/styles/space';
import {AvatarUser, OnboardingTask, OnboardingTaskKey, Organization} from 'app/types';
import {trackAnalyticsEvent} from 'app/utils/analytics';
import testableTransition from 'app/utils/testableTransition';
import withOrganization from 'app/utils/withOrganization';

import SkipConfirm from './skipConfirm';
import {taskIsDone} from './utils';

const recordAnalytics = (
  task: OnboardingTask,
  organization: Organization,
  action: string
) =>
  trackAnalyticsEvent({
    eventKey: 'onboarding.wizard_clicked',
    eventName: 'Onboarding Wizard Clicked',
    organization_id: organization.id,
    todo_id: task.task,
    todo_title: task.title,
    action,
  });

type Props = ReactRouter.WithRouterProps & {
  /**
   * Task to render
   */
  task: OnboardingTask;
  /**
   * Fired when the task has been skipped
   */
  onSkip: (taskKey: OnboardingTaskKey) => void;
  /**
   * Fired when a task is completed. This will typically happen if there is a
   * supplemental component with the ability to complete a task
   */
  onMarkComplete: (taskKey: OnboardingTaskKey) => void;

  forwardedRef: React.Ref<HTMLDivElement>;
  organization: Organization;
};

function Task({router, task, onSkip, onMarkComplete, forwardedRef, organization}: Props) {
  const handleSkip = () => {
    recordAnalytics(task, organization, 'skipped');
    onSkip(task.task);
  };

  const handleClick = (e: React.MouseEvent) => {
    recordAnalytics(task, organization, 'clickthrough');
    e.stopPropagation();

    if (task.actionType === 'external') {
      window.open(task.location, '_blank');
    }

    if (task.actionType === 'action') {
      task.action();
    }

    if (task.actionType === 'app') {
      navigateTo(`${task.location}?onboardingTask`, router);
    }
  };

  if (taskIsDone(task) && task.completionSeen) {
    const completedOn = moment(task.dateCompleted);

    return (
      <ItemComplete ref={forwardedRef} onClick={handleClick}>
        <StatusIndicator>
          {task.status === 'complete' && <CompleteIndicator />}
          {task.status === 'skipped' && <SkippedIndicator />}
        </StatusIndicator>
        {task.title}
        <CompletedDate title={completedOn.toString()}>
          {completedOn.fromNow()}
        </CompletedDate>
        {task.user ? (
          <TaskUserAvatar hasTooltip user={task.user} />
        ) : (
          <Tooltip
            containerDisplayMode="inherit"
            title={t('No user was associated with completing this task')}
          >
            <TaskBlankAvatar round />
          </Tooltip>
        )}
      </ItemComplete>
    );
  }

  const IncompleteMarker = task.requisiteTasks.length > 0 && (
    <Tooltip
      containerDisplayMode="block"
      title={tct('[requisite] before completing this task', {
        requisite: task.requisiteTasks[0].title,
      })}
    >
      <IconLock size="xs" color="orange300" />
    </Tooltip>
  );

  const {SupplementComponent} = task;
  const supplement = SupplementComponent && (
    <SupplementComponent task={task} onCompleteTask={() => onMarkComplete(task.task)} />
  );

  const skipAction = task.skippable && (
    <SkipConfirm onSkip={handleSkip}>
      {({skip}) => <StyledIconClose onClick={skip} />}
    </SkipConfirm>
  );

  return (
    <TaskCard
      interactive
      ref={forwardedRef}
      onClick={handleClick}
      data-test-id={task.task}
    >
      {skipAction}
      <Title>
        {IncompleteMarker}
        {task.title}
      </Title>
      <Description>{`${task.description}. ${task.detailedDescription}`}</Description>
      {task.requisiteTasks.length === 0 && (
        <ActionBar>
          {supplement}
          {task.status === 'pending' ? (
            <InProgressIndicator user={task.user} />
          ) : (
            <Button priority="primary" size="small">
              {t('Start')}
            </Button>
          )}
        </ActionBar>
      )}
    </TaskCard>
  );
}

const TaskCard = styled(Card)`
  position: relative;
  min-height: 140px;
`;

const Title = styled('div')`
  display: grid;
  grid-template-columns: max-content 1fr;
  grid-gap: ${space(1)};
  align-items: center;
  font-weight: 600;
`;

const Description = styled('p')`
  font-size: ${p => p.theme.fontSizeSmall};
  color: ${p => p.theme.subText};
  margin: 0;
`;

const ActionBar = styled('div')`
  display: flex;
`;

type InProgressIndicatorProps = React.HTMLAttributes<HTMLDivElement> & {
  user?: AvatarUser | null;
};

const InProgressIndicator = styled(({user, ...props}: InProgressIndicatorProps) => (
  <div {...props}>
    <Tooltip
      disabled={!user}
      containerDisplayMode="flex"
      title={tct('This task has been started by [user]', {
        user: user?.name,
      })}
    >
      <IconEvent />
    </Tooltip>
    {t('Task in progress...')}
  </div>
))`
  font-size: ${p => p.theme.fontSizeMedium};
  font-weight: bold;
  color: ${p => p.theme.orange300};
  display: grid;
  grid-template-columns: max-content max-content;
  align-items: center;
  grid-gap: ${space(1)};
`;

const StyledIconClose = styled(IconClose)`
  position: absolute;
  right: ${space(1)};
  top: ${space(1)};
  color: ${p => p.theme.gray300};
`;

const ItemComplete = styled(Card)`
  cursor: pointer;
  color: ${p => p.theme.subText};
  padding: ${space(1)} ${space(1.5)};
  display: grid;
  grid-template-columns: max-content 1fr max-content 20px;
  grid-gap: ${space(1)};
  align-items: center;
`;

const transition = testableTransition();

const StatusIndicator = styled(motion.div)`
  display: flex;
`;
StatusIndicator.defaultProps = {
  variants: {
    initial: {opacity: 0, x: 10},
    animate: {opacity: 1, x: 0},
  },
  transition,
};

const CompleteIndicator = styled(IconCheckmark)``;
CompleteIndicator.defaultProps = {
  isCircled: true,
  color: 'green300',
};

const SkippedIndicator = styled(IconClose)``;
SkippedIndicator.defaultProps = {
  isCircled: true,
  color: 'orange300',
};

const completedItemAnimation = {
  initial: {opacity: 0, x: -10},
  animate: {opacity: 1, x: 0},
};

const CompletedDate = styled(motion.div)`
  color: ${p => p.theme.gray300};
  font-size: ${p => p.theme.fontSizeSmall};
`;
CompletedDate.defaultProps = {
  variants: completedItemAnimation,
  transition,
};

const TaskUserAvatar = motion.custom(Avatar);
TaskUserAvatar.defaultProps = {
  variants: completedItemAnimation,
  transition,
};

const TaskBlankAvatar = styled(motion.custom(LetterAvatar))`
  position: unset;
`;
TaskBlankAvatar.defaultProps = {
  variants: completedItemAnimation,
  transition,
};

const WrappedTask = withOrganization(ReactRouter.withRouter(Task));

export default React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentProps<typeof WrappedTask>, 'forwardedRef'>
>((props, ref) => <WrappedTask forwardedRef={ref} {...props} />);
