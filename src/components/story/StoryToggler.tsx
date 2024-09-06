import React, { memo, useEffect, useMemo } from '../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { ANIMATION_END_DELAY, PREVIEW_AVATAR_COUNT } from '../../config';
import { selectIsForumPanelOpen, selectPerformanceSettingsValue, selectTabState } from '../../global/selectors';
import { animateClosing, animateOpening, ANIMATION_DURATION } from './helpers/ribbonAnimation';

import { dispatchHeavyAnimationEvent } from '../../hooks/useHeavyAnimationCheck';
import useOldLang from '../../hooks/useOldLang';
import useShowTransition from '../../hooks/useShowTransition';
import useStoryPreloader from './hooks/useStoryPreloader';

import Avatar from '../common/Avatar';

import styles from './StoryToggler.module.scss';

interface OwnProps {
  isArchived?: boolean;
  canShow?: boolean;
}

interface StateProps {
  currentUserId: string;
  orderedPeerIds: string[];
  isShown: boolean;
  isForumPanelOpen?: boolean;
  withAnimation?: boolean;
  peerStories: GlobalState['stories']['byPeerId'];
}

const PRELOAD_PEERS = 5;

function StoryToggler({
  currentUserId,
  orderedPeerIds,
  canShow,
  isShown,
  isForumPanelOpen,
  isArchived,
  withAnimation,
  peerStories,
}: OwnProps & StateProps) {
  const { toggleStoryRibbon } = getActions();

  const lang = useOldLang();

  const peers = useMemo(() => {
    // No need for expensive global updates on users, so we avoid them
    const usersById = getGlobal().users.byId;
    const chatsById = getGlobal().chats.byId;

    if (orderedPeerIds.length === 1) {
      return [usersById[orderedPeerIds[0]] || chatsById[orderedPeerIds[0]]];
    }

    return orderedPeerIds
      .map((id) => usersById[id] || chatsById[id])
      .filter((peer) => peer && peer.id !== currentUserId)
      .slice(0, PREVIEW_AVATAR_COUNT)
      .reverse();
  }, [currentUserId, orderedPeerIds]);

  const closeFriends = useMemo(() => {
    if (!peers?.length) return {};
    return peers.reduce((acc, peer) => {
      const stories = peerStories[peer.id];
      if (!stories) return acc;

      const isCloseFriend = stories.orderedIds.some((id) => {
        const story = stories.byId[id];
        if (!story || !('isForCloseFriends' in story)) return false;
        const isRead = stories.lastReadId && story.id <= stories.lastReadId;
        return story.isForCloseFriends && !isRead;
      });

      acc[peer.id] = isCloseFriend;
      return acc;
    }, {} as Record<string, boolean>);
  }, [peerStories, peers]);

  const preloadPeerIds = useMemo(() => {
    return orderedPeerIds.slice(0, PRELOAD_PEERS);
  }, [orderedPeerIds]);

  useStoryPreloader(preloadPeerIds);

  const isVisible = canShow && isShown;
  // For some reason, setting 'slow' here also fixes scroll freezes on iOS when collapsing Story Ribbon
  const { ref, shouldRender } = useShowTransition<HTMLButtonElement>({
    isOpen: isVisible,
    className: 'slow',
    withShouldRender: true,
  });

  useEffect(() => {
    if (!withAnimation || isForumPanelOpen) return;
    if (isVisible) {
      dispatchHeavyAnimationEvent(ANIMATION_DURATION + ANIMATION_END_DELAY);
      animateClosing(isArchived);
    } else {
      dispatchHeavyAnimationEvent(ANIMATION_DURATION + ANIMATION_END_DELAY);
      animateOpening(isArchived);
    }
  }, [isArchived, isVisible, withAnimation, isForumPanelOpen]);

  if (!shouldRender) {
    return undefined;
  }

  return (
    <button
      ref={ref}
      type="button"
      id="StoryToggler"
      className={styles.root}
      aria-label={lang('Chat.Context.Peer.OpenStory')}
      onClick={() => toggleStoryRibbon({ isShown: true, isArchived })}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      {peers.map((peer) => (
        <Avatar
          key={peer.id}
          peer={peer}
          size="tiny"
          className={styles.avatar}
          withStorySolid
          forceFriendStorySolid={closeFriends[peer.id]}
        />
      ))}
    </button>
  );
}

export default memo(withGlobal<OwnProps>((global, { isArchived }): StateProps => {
  const { orderedPeerIds: { archived, active }, byPeerId } = global.stories;
  const { storyViewer: { isRibbonShown, isArchivedRibbonShown } } = selectTabState(global);
  const isForumPanelOpen = selectIsForumPanelOpen(global);
  const withAnimation = selectPerformanceSettingsValue(global, 'storyRibbonAnimations');

  return {
    currentUserId: global.currentUserId!,
    orderedPeerIds: isArchived ? archived : active,
    isShown: isArchived ? !isArchivedRibbonShown : !isRibbonShown,
    isForumPanelOpen,
    withAnimation,
    peerStories: byPeerId,
  };
})(StoryToggler));
