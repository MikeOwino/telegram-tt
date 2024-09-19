import type { FC } from '../../../lib/teact/teact';
import React, {
  beginHeavyAnimation,
  memo, useEffect, useMemo, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiChat } from '../../../api/types';
import { MAIN_THREAD_ID } from '../../../api/types';

import {
  GENERAL_TOPIC_ID, TOPIC_HEIGHT_PX, TOPIC_LIST_SENSITIVE_AREA, TOPICS_SLICE,
} from '../../../config';
import { requestNextMutation } from '../../../lib/fasterdom/fasterdom';
import { getOrderedTopics } from '../../../global/helpers';
import {
  selectCanAnimateInterface, selectChat, selectCurrentMessageList, selectIsForumPanelOpen, selectTabState,
} from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { captureEvents, SwipeDirection } from '../../../util/captureEvents';
import { waitForTransitionEnd } from '../../../util/cssAnimationEndListeners';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';

import useAppLayout from '../../../hooks/useAppLayout';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useInfiniteScroll from '../../../hooks/useInfiniteScroll';
import { useIntersectionObserver, useOnIntersect } from '../../../hooks/useIntersectionObserver';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';
import usePreviousDeprecated from '../../../hooks/usePreviousDeprecated';
import useOrderDiff from './hooks/useOrderDiff';

import GroupCallTopPane from '../../calls/group/GroupCallTopPane';
import GroupChatInfo from '../../common/GroupChatInfo';
import HeaderActions from '../../middle/HeaderActions';
import Button from '../../ui/Button';
import InfiniteScroll from '../../ui/InfiniteScroll';
import Loading from '../../ui/Loading';
import EmptyForum from './EmptyForum';
import Topic from './Topic';

import styles from './ForumPanel.module.scss';

type OwnProps = {
  isOpen?: boolean;
  isHidden?: boolean;
  onTopicSearch?: NoneToVoidFunction;
  onCloseAnimationEnd?: VoidFunction;
  onOpenAnimationStart?: VoidFunction;
};

type StateProps = {
  chat?: ApiChat;
  currentTopicId?: number;
  withInterfaceAnimations?: boolean;
};

const INTERSECTION_THROTTLE = 200;

const ForumPanel: FC<OwnProps & StateProps> = ({
  chat,
  currentTopicId,
  isOpen,
  isHidden,
  onTopicSearch,
  onCloseAnimationEnd,
  onOpenAnimationStart,
  withInterfaceAnimations,
}) => {
  const {
    closeForumPanel, openChatWithInfo, loadTopics,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const scrollTopHandlerRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useAppLayout();

  useEffect(() => {
    if (chat && !chat.topics) {
      loadTopics({ chatId: chat.id });
    }
  }, [chat, loadTopics]);

  const [isScrolled, setIsScrolled] = useState(false);
  const lang = useOldLang();

  const handleClose = useLastCallback(() => {
    closeForumPanel();
  });

  useEffect(() => {
    if (!withInterfaceAnimations && !isOpen) {
      onCloseAnimationEnd?.();
    }
  }, [withInterfaceAnimations, isOpen, onCloseAnimationEnd]);

  const handleToggleChatInfo = useLastCallback(() => {
    if (!chat) return;
    openChatWithInfo({ id: chat.id, shouldReplaceHistory: true });
  });

  const { observe } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  useOnIntersect(scrollTopHandlerRef, observe, ({ isIntersecting }) => {
    setIsScrolled(!isIntersecting);
  });

  const orderedIds = useMemo(() => {
    return chat?.topics
      ? getOrderedTopics(Object.values(chat.topics), chat.orderedPinnedTopicIds).map(({ id }) => id)
      : [];
  }, [chat]);

  const { orderDiffById, getAnimationType } = useOrderDiff(orderedIds, chat?.id);

  const [viewportIds, getMore] = useInfiniteScroll(() => {
    if (!chat) return;
    loadTopics({ chatId: chat.id });
  }, orderedIds, !chat?.topicsCount || orderedIds.length >= chat.topicsCount, TOPICS_SLICE);

  const shouldRenderRef = useRef(false);
  const isVisible = isOpen && !isHidden;
  const prevIsVisible = usePreviousDeprecated(isVisible);

  if (prevIsVisible !== isVisible) {
    shouldRenderRef.current = false;
  }

  useHistoryBack({
    isActive: isVisible,
    onBack: handleClose,
  });

  useEffect(() => (isVisible ? captureEscKeyListener(handleClose) : undefined), [handleClose, isVisible]);

  useEffect(() => {
    if (prevIsVisible !== isVisible) {
      // For performance reasons, we delay animation of the topic list panel to the next animation frame
      requestNextMutation(() => {
        if (!ref.current) return;

        const endHeavyAnimation = beginHeavyAnimation();
        waitForTransitionEnd(ref.current, endHeavyAnimation);

        onOpenAnimationStart?.();

        if (isVisible) {
          shouldRenderRef.current = true;
          ref.current!.style.transform = 'none';
        } else {
          shouldRenderRef.current = false;
          ref.current!.style.transform = '';
        }
      });
    }
  }, [isVisible, onOpenAnimationStart, prevIsVisible]);

  useEffect(() => {
    if (!IS_TOUCH_ENV) {
      return undefined;
    }

    return captureEvents(ref.current!, {
      selectorToPreventScroll: '.chat-list',
      onSwipe: ((e, direction) => {
        const closeDirection = lang.isRtl ? SwipeDirection.Left : SwipeDirection.Right;

        if (direction === closeDirection) {
          closeForumPanel();
          return true;
        }

        return false;
      }),
    });
  }, [closeForumPanel, lang.isRtl]);

  function renderTopics() {
    const viewportOffset = orderedIds!.indexOf(viewportIds![0]);

    return viewportIds?.map((id, i) => (
      <Topic
        key={id}
        chatId={chat!.id}
        topic={chat!.topics![id]}
        style={`top: ${(viewportOffset + i) * TOPIC_HEIGHT_PX}px;`}
        isSelected={currentTopicId === id}
        observeIntersection={observe}
        animationType={getAnimationType(id)}
        orderDiff={orderDiffById[id]}
      />
    ));
  }

  const isLoading = chat?.topics === undefined;

  return (
    <div
      ref={ref}
      className={buildClassName(
        styles.root,
        isScrolled && styles.scrolled,
        lang.isRtl && styles.rtl,
        !withInterfaceAnimations && styles.noAnimation,
      )}
      onTransitionEnd={!isOpen ? onCloseAnimationEnd : undefined}
    >
      <div id="TopicListHeader" className="left-header">
        <Button
          round
          size="smaller"
          color="translucent"
          onClick={handleClose}
          ariaLabel={lang('Close')}
        >
          <i className="icon icon-close" />
        </Button>

        {chat && (
          <GroupChatInfo
            noAvatar
            className={styles.info}
            chatId={chat.id}
            onClick={handleToggleChatInfo}
          />
        )}

        {chat
          && (
            <HeaderActions
              chatId={chat.id}
              threadId={MAIN_THREAD_ID}
              messageListType="thread"
              canExpandActions={false}
              isForForum
              isMobile={isMobile}
              onTopicSearch={onTopicSearch}
            />
          )}
      </div>

      {chat && <GroupCallTopPane chatId={chat.id} hasPinnedOffset={false} className={styles.groupCall} />}

      <div className={styles.notch} />

      <InfiniteScroll
        className="chat-list custom-scroll"
        ref={containerRef}
        items={viewportIds}
        preloadBackwards={TOPICS_SLICE}
        withAbsolutePositioning
        maxHeight={(orderedIds?.length || 0) * TOPIC_HEIGHT_PX}
        onLoadMore={getMore}
        sensitiveArea={TOPIC_LIST_SENSITIVE_AREA}
        beforeChildren={<div ref={scrollTopHandlerRef} className={styles.scrollTopHandler} />}
      >
        {Boolean(viewportIds?.length) && (
          renderTopics()
        )}
        {isLoading && !viewportIds?.length && (
          <Loading key="loading" />
        )}
      </InfiniteScroll>
      {!isLoading && viewportIds?.length === 1 && viewportIds[0] === GENERAL_TOPIC_ID && (
        <EmptyForum chatId={chat.id} />
      )}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const chatId = selectTabState(global).forumPanelChatId;
    const chat = chatId ? selectChat(global, chatId) : undefined;
    const {
      chatId: currentChatId,
      threadId: currentThreadId,
    } = selectCurrentMessageList(global) || {};

    return {
      chat,
      currentTopicId: chatId === currentChatId ? Number(currentThreadId) : undefined,
      withInterfaceAnimations: selectCanAnimateInterface(global),
    };
  },
  (global) => selectIsForumPanelOpen(global),
)(ForumPanel));
