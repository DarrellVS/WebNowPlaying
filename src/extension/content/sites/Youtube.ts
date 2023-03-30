import { findBiggestImage, timeInSecondsToString } from '../../../utils/misc'
import { RepeatMode, Site, StateMode, YouTubePlaylistDetails, YouTubeVideoDetails } from '../../types'
import { parseSelector, querySelector } from '../selectors'
import { ContentUtils, ratingUtils } from '../utils'

let currentYouTubeContainer: Element | null = null
let currentVideoDetails: YouTubeVideoDetails | null = null
let currentPlaylistDetails: YouTubePlaylistDetails | null = null

const site: Site = {
  init: () => {
    setInterval(async () => {
      const info = await ContentUtils.getYouTubeInfo()
      currentYouTubeContainer = document.querySelector(info.containerLocalName as string)
      currentVideoDetails = info.videoDetails
      currentPlaylistDetails = info.playlistDetails
    }, ContentUtils.getSettings().updateFrequencyMs2 / 2)
  },
  ready: () => true,
  info: {
    player: () => 'YouTube',
    state: () => queryYouTubeContainer<StateMode, HTMLVideoElement>('.html5-main-video[src]', (el) => (el.paused ? StateMode.PAUSED : StateMode.PLAYING), StateMode.PAUSED),
    title: () => {
      if (currentVideoDetails?.title && currentYouTubeContainer) return currentVideoDetails.title
      return ''
    },
    artist: () => {
      if (currentVideoDetails?.author && currentYouTubeContainer) return currentVideoDetails.author
      return ''
    },
    album: () => {
      if (currentPlaylistDetails?.title?.length && currentYouTubeContainer) return currentPlaylistDetails.title
      return ''
    },
    cover: () => {
      if (currentVideoDetails?.thumbnail?.thumbnails && currentYouTubeContainer) {
        const url = findBiggestImage(currentVideoDetails.thumbnail.thumbnails)
        if (url) return url.split('?')[0]
      }
      return ''
    },
    duration: () => queryYouTubeContainer<string, HTMLVideoElement>('.html5-main-video[src]', (el) => timeInSecondsToString(el.duration), '0:00'),
    position: () => queryYouTubeContainer<string, HTMLVideoElement>('.html5-main-video[src]', (el) => timeInSecondsToString(el.currentTime), '0:00'),
    volume: () => queryYouTubeContainer<number, HTMLVideoElement>('.html5-main-video[src]', (el) => (el.muted ? 0 : el.volume * 100), 100),
    rating: () => {
      if (currentYouTubeContainer?.localName === 'ytd-shorts') {
        const container = currentYouTubeContainer?.querySelector('ytd-player')?.parentElement?.parentElement
        const likeButton = container?.querySelector('#segmented-like-button button, #like-button button')
        if (likeButton?.getAttribute('aria-pressed') === 'true') return 5
        const dislikeButton = container?.querySelector('#segmented-dislike-button button, #dislike-button button')
        if (dislikeButton?.getAttribute('aria-pressed') === 'true') return 1
      } else {
        const likeButtonPressed = querySelector<boolean, HTMLButtonElement>('#segmented-like-button button, #like-button button', (el) => el.getAttribute('aria-pressed') === 'true', false)
        if (likeButtonPressed) return 5
        const dislikeButtonPressed = querySelector<boolean, HTMLButtonElement>('#segmented-dislike-button button, #dislike-button button', (el) => el.getAttribute('aria-pressed') === 'true', false)
        if (dislikeButtonPressed) return 1
      }
      return 0
    },
    repeat: () => {
      // If the playlist loop is set to video, it sets the video to loop
      if (queryYouTubeContainer<boolean, HTMLVideoElement>('.html5-main-video[src]', (el) => el.loop, false)) return RepeatMode.ONE
      const playlistRepeatButtonSvgPath = queryYouTubeContainer<string, HTMLElement>('#playlist-action-menu path', (el) => el.getAttribute('d'), '')
      const svgPathLoopPlaylist = 'M20,14h2v5L5.84,19.02l1.77,1.77l-1.41,1.41L1.99,18l4.21-4.21l1.41,1.41l-1.82,1.82L20,17V14z M4,7l14.21-0.02l-1.82,1.82 l1.41,1.41L22.01,6l-4.21-4.21l-1.41,1.41l1.77,1.77L2,5v6h2V7z'
      if (playlistRepeatButtonSvgPath === svgPathLoopPlaylist) return RepeatMode.ALL
      return RepeatMode.NONE
    },
    shuffle: () => queryYouTubeContainer<boolean, HTMLButtonElement>('(#playlist-action-menu button)[1]', (el) => el.getAttribute('aria-pressed') === 'true', false)
  },
  events: {
    togglePlaying: () => queryYouTubeContainer<any, HTMLVideoElement>('.html5-main-video[src]', (el) => (el.paused ? el.play() : el.pause()), null),
    next: () => {
      const chapters = findNearestChapters()
      if (chapters?.next) return site.events.setPositionSeconds?.(chapters.next)
      queryYouTubeContainer<any, HTMLButtonElement>('.ytp-next-button, #navigation-button-down button', (el) => el.click(), null)
    },
    previous: () => {
      const chapters = findNearestChapters()
      if (chapters?.previous) return site.events.setPositionSeconds?.(chapters.previous)
      queryYouTubeContainer<any, HTMLVideoElement>('.html5-main-video[src]', (el) => {
        if (el.currentTime > 5) el.currentTime = 0
        else queryYouTubeContainer<any, HTMLButtonElement>('.ytp-prev-button, #navigation-button-up button', (el) => el.click(), null)
      }, null)
    },
    setPositionSeconds: (positionInSeconds: number) => queryYouTubeContainer<any, HTMLVideoElement>('.html5-main-video[src]', (el) => el.currentTime = positionInSeconds, null),
    setPositionPercentage: null,
    setVolume: (volume: number) => queryYouTubeContainer<any, HTMLVideoElement>('.html5-main-video[src]', (el) => {
      el.muted = false
      el.volume = volume / 100
    }, null),
    toggleRepeat: () => {
      let success = false
      if (currentPlaylistDetails?.playlistId) {
        success = queryYouTubeContainer<boolean, HTMLButtonElement>('#playlist-action-menu button', (el) => {
          el.click()
          return true
        }, false)
      }
      if (!success) queryYouTubeContainer<any, HTMLVideoElement>('.html5-main-video[src]', (el) => el.loop = !el.loop, null)
    },
    toggleShuffle: () => queryYouTubeContainer<any, HTMLButtonElement>('(#playlist-action-menu button)[1]', (el) => el.click(), null),
    toggleThumbsUp: () => {
      let likeButton: HTMLButtonElement | null = null
      if (currentYouTubeContainer?.localName === 'ytd-shorts') {
        const container = currentYouTubeContainer?.querySelector('ytd-player')?.parentElement?.parentElement
        likeButton = container?.querySelector('#segmented-like-button button, #like-button button') as HTMLButtonElement
      } else {
        likeButton = document.querySelector('#segmented-like-button button, #like-button button')
      }
      if (likeButton) (likeButton as HTMLButtonElement).click?.()
    },
    toggleThumbsDown: () => {
      let dislikeButton: HTMLButtonElement | null = null
      const getDislikeButton = (container: Element | null | undefined) => {
        if (!container) return
        dislikeButton = container.querySelector('#segmented-dislike-button button, #dislike-button button')
      }
      getDislikeButton(currentYouTubeContainer?.querySelector('ytd-player')?.parentElement?.parentElement)
      if (!dislikeButton) getDislikeButton(currentYouTubeContainer)
      if (dislikeButton) (dislikeButton as HTMLButtonElement).click?.()
    },
    setRating: (rating: number) => ratingUtils.likeDislike(site, rating)
  }
}

function queryYouTubeContainer<T, E extends Element>(selectorStr: string, exec: (el: E) => T | null, defaultValue: T): T {
  if (!currentYouTubeContainer) return defaultValue
  const { selector, index } = parseSelector(selectorStr)
  const el = currentYouTubeContainer.querySelectorAll(selector)[index]
  if (!el) return defaultValue
  const result = exec(el as any)
  if (!result && result !== 0 && result !== false) return defaultValue
  return result
}

// The chapter stuff is heavily inspired by:
// https://github.com/aminomancer/WebNowPlaying-Companion-Personal-Edit/blob/master/Websites/YouTube.js

function findChapterListInComments() {
  const currentURL = new URL(window.location.href)
  function getSeconds(el: HTMLAnchorElement) {
    if (!el.href) return null
    const linkURL = new URL(el.href)
    if (
      linkURL.pathname === currentURL.pathname
      && linkURL.searchParams.get('v') === currentURL.searchParams.get('v')
    ) {
      const timeString = linkURL.searchParams.get('t')
      if (timeString !== null) {
        const time = parseInt(timeString)
        if (!isNaN(time)) return time
      }
    }
    return null
  }
  const lists = Array.from(document.querySelectorAll('ytd-comment-thread-renderer > ytd-comment-renderer#comment'))
    .map((comment) =>
      Array.from(comment.querySelector('#content-text')?.children || [])
        .map((el) => getSeconds(el as HTMLAnchorElement))
        .filter((t) => t !== null)
    )
    .filter((list) => list.length > 2)
    .sort((a, b) => a.length - b.length) as number[][]
  return lists[0] || null
}

function findMarkerList(panel: Element | null) {
  if (!panel) return null
  const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('ytd-macro-markers-list-item-renderer > a'))
  const times = links.map((el) => {
    if (!el.href) return null
    const linkURL = new URL(el.href)
    const timeString = linkURL.searchParams.get('t')
    if (timeString !== null) {
      const time = parseInt(timeString)
      if (!isNaN(time)) return time
    }
    return null
  }).filter((t) => t !== null) as number[]
  if (times.length > 2) return times
  return null
}

function findChapterList() {
  const container = currentYouTubeContainer
  if (container?.localName !== 'ytd-watch-flexy' && container?.id !== 'content') return null
  // Check for a list of chapters in the description as they are the most reliable
  const descriptionChapters = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]')
  const descriptionChaptersList = findMarkerList(descriptionChapters)
  if (descriptionChaptersList) return descriptionChaptersList
  // Check for a list of chapters in the comments
  const commentList = findChapterListInComments()
  if (commentList) return commentList
  // Look for automatically generated chapters
  const autoChapters = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-auto-chapters"]')
  const autoChaptersList = findMarkerList(autoChapters)
  if (autoChaptersList) return autoChaptersList
  return null
}

function findNearestChapters() {
  if (!ContentUtils.getSettings().YouTubeSkipChapters) return null
  const timeList = findChapterList()?.sort((a, b) => a - b)
  if (!timeList) return null
  const current = currentYouTubeContainer?.querySelector<HTMLVideoElement>('.html5-main-video[src]')?.currentTime || 0
  let next = null
  let previous = null
  for (let i = 0; i < timeList.length; i++) {
    if (timeList[i] > current) {
      next = timeList[i]
      break
    }
    previous = current - timeList[i] <= 3 ? previous : timeList[i]
  }

  return { next, previous }
}

export default site