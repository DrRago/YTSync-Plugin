import ScheduleUtil from './util/schedule';
import { SessionId } from './util/consts';
import URLUtil from './util/url';
import * as ytHTML from './util/yt-html';
import VideoUtil from './util/video';
import { Message } from './enum/message';
import YTUtil from './util/yt';

declare global {
    interface Window {
        YT: typeof YT;
    }
}

export default class Player {
    private sessionId: string;
    private ytPlayer: YT.Player = null;
    private ws: SocketIOClient.Socket;
    private options: PlayerOptions;
    private queueItemsElement: JQuery<Element>;

    constructor(options: PlayerOptions) {
        this.options = options;
    }

    /**
     * Create a Player.
     *
     * @param videoId The video that should be initially be played
     * @param sessionId
     * @param queueElement The element of the playlist items (Mostly 'ytd-playlist-panel-renderer #items')
     */
    public create(videoId: string, sessionId: string) {
        if(this.ytPlayer !== null)
            return;

        const renderer = ytHTML.injectEmptyQueueShell('Queue', false, true);
        this.queueItemsElement = renderer.find('#items');

        this.ytPlayer = new unsafeWindow.YT.Player('ytd-player', {
            width: '100%',
            height: '100%',
            videoId,
            playerVars: {
                color: 'red',
                autoplay: YT.AutoPlay.AutoPlay
            },
            events: {
                onReady: (e) => this.onReady(e, sessionId),
                onStateChange: (e) => this.onStateChange(e)
            }
        });
    }

    /**
     * Handler function for the YT.Player -> onReady
     *
     * @param sessionId
     */
    private onReady(_: YT.PlayerEvent, sessionId: string): void {
        ScheduleUtil.startSeekSchedule(this.ytPlayer, () => this.onPlayerSeek());
        ScheduleUtil.startUrlChangeSchedule((o, n) => this.onUrlChange(o, n));
        ScheduleUtil.startQueueStoreSchedule((v) => this.sendWsRequestToAddToQueue(v));

        this.connectWs(sessionId);
    }

    /**
     * Handler function for a YT.Player -> OnStateChange
     *
     * @param event
     */
    private onStateChange(event: YT.OnStateChangeEvent): void {
        switch(event.data) {
            case unsafeWindow.YT.PlayerState.PLAYING:
                this.sendWsTimeMessage(Message.PLAY);
                break;
            case unsafeWindow.YT.PlayerState.PAUSED:
                this.sendWsTimeMessage(Message.PAUSE);
                break;
        }
    }

    /**
     * Handler function for the URLSchedule
     *
     * @param o The old window Location
     * @param n The new window Location
     *
     * @see startUrlChangeSchedule
     */
    private onUrlChange(o: Location, n: Location): void {
        console.log(`URL CHANGE: ${o.href} -> ${n.href}`);
        const oldParams = new URLSearchParams(o.search);
        const newParams = new URLSearchParams(n.search);

        const oldSessionId = oldParams.get(SessionId);
        const newSessionId = newParams.get(SessionId);
        if(oldSessionId !== null && newSessionId === null) {
            // newParams.set(SessionId, oldSessionId);
            // changeQueryString(newParams.toString(), undefined);
            window.location.search = newParams.toString();
            return;
        }

        const videoId = newParams.get('v');
        if(videoId !== null) {
            this.sendWsMessage(Message.PLAY_VIDEO, videoId);
            console.log(`Loading new VIDEO: ${videoId}`);
            this.ytPlayer.loadVideoById(videoId);
        }
    }

    /**
     * Handler for a Player seek.
     * Will send a SEEK Message.
     */
    private onPlayerSeek(): void {
        this.sendWsTimeMessage(Message.SEEK);
    }

    /**
     * Connect to the Server with the given sessionId.
     *
     * @param sessionId
     */
    private connectWs(sessionId: string): void {
        this.sessionId = sessionId;
        const { protocol, host, port } = this.options.connection;

        this.ws = io(`${protocol}://${host}:${port}/${sessionId}`, {
            autoConnect: true,
            path: '/socket.io'
        });
        this.ws.on('connect', () => this.onWsConnected());
        this.ws.on('message', (d: string) => this.onWsMessage(d));
    }

    /**
     * Handler function for the Websocket 'connect' event
     */
    private onWsConnected(): void {
        console.log('Connected');
        const video = VideoUtil.getCurrentVideo();
        this.sendWsRequestToAddToQueue(video);
        this.sendWsMessage(Message.PLAY_VIDEO, video.videoId);
    }

    /**
     * Handler function for a Websocket message.
     *
     * @param message
     * @param player
     */
    private onWsMessage(message: string): void {
        try {
            const json = JSON.parse(message);
            const command = json.action;
            const data = json.data;

            console.log(`Message: ${message}`);

            const playerState = this.ytPlayer.getPlayerState();

            switch(command) {
                case Message.PLAY:
                    this.syncPlayerTime(parseFloat(data));

                    if(playerState === unsafeWindow.YT.PlayerState.PAUSED)
                        this.ytPlayer.playVideo();

                    break;
                case Message.PAUSE:
                    this.syncPlayerTime(parseFloat(data));

                    if(playerState === unsafeWindow.YT.PlayerState.PLAYING)
                        this.ytPlayer.pauseVideo();

                    break;
                case Message.SEEK:
                    this.ytPlayer.seekTo(parseFloat(data), true);
                    break;
                case Message.PLAY_VIDEO:
                    this.changeQueryStringVideoId(data);
                    break;
                case Message.QUEUE:
                    this.populateQueue(data);
                    break;
                case Message.ADD_TO_QUEUE:
                    this.addToQueue(data, false);
                    break;
                case Message.REMOVE_FROM_QUEUE:
                    this.removeFromQueue(data);
                    break;
            }
        }
        catch(e) { console.error(e); }
    }

    /**
     * Send a message to the session containing the current video time as data
     *
     * @param type The type of the message
     */
    private sendWsTimeMessage(type: Message.PLAY | Message.PAUSE | Message.SEEK): void {
        this.sendWsMessage(type, this.ytPlayer.getCurrentTime().toString());
    }

    /**
     * Send a message to the session
     *
     * @param type The message type
     * @param data The message data
     */
    private sendWsMessage(type: Message, data: any): void {
        console.log(`Sending Message: ${type} | ${data}`);
        const message = {
            action: type,
            data
        };
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Request to add the given Video to the Queue.
     * Will only work if the client has the needed Permissions.
     *
     * @param video The video that should be added to the Queue
     */
    private sendWsRequestToAddToQueue(video: Video) {
        this.sendWsMessage(Message.ADD_TO_QUEUE, video);
    }

    /**
     * Populate the Queue.
     *
     * **Caution**: Will clear existing Queue.
     *
     * @param data The data to populate the Queue with
     */
    private populateQueue(data: QueueMessageData): void {
        this.queueItemsElement.empty();

        data.videos.forEach((video) => {
            this.addToQueue(
                video,
                data.video !== null && video.videoId === data.video.videoId
            );
        });
    }

    /**
     * Add the given Video to the Queue.
     *
     * **Caution**: This will only add the Video visually.
     * There will not be send a request to add the Video to the Queue.
     * For this please use: {@link sendWsRequestToAddToQueue}
     *
     * @param video
     * @param selected
     */
    private addToQueue(video: Video, selected: boolean = false): void {
        ytHTML.injectVideoQueueElement(
            this.queueItemsElement,
            selected,
            video.videoId,
            video.title,
            video.byline,
            this.queueElementClickHandler(video.videoId),
            this.queueElementDeleteHandler(video.videoId)
        );
    }

    /**
     * Remove the Video from the Queue.
     *
     * **Caution**: This will only remove the Video visually.
     * There will not be send a request to remove the Video from the Queue.
     *
     * @param video
     */
    private removeFromQueue(video: Video): void {
        this.queueItemsElement
            .find(`[videoId="${video.videoId}"]`)
            .remove();
    }

    /**
     * Select the Video with given videoId in the Queue
     *
     * @param videoId
     */
    private selectQueueElement(videoId: string): void {
        // Deselect all selected
        this.queueItemsElement
            .children()
            .removeAttr('selected');
        // Select Video
        this.queueItemsElement
            .find(`[videoId="${videoId}"]`)
            .attr('selected', '');
    }

    /**
     * Returns a Handler function for a Queue Element click.
     *
     * @param videoId
     */
    private queueElementClickHandler(videoId: string): () => void {
        return () => {
            const app = YTUtil.getApp();
            app.onYtNavigate_({
                detail: {
                    endpoint: {
                        watchEndpoint: {
                            videoId
                        }
                    },
                    params: {
                        [SessionId]: this.sessionId
                    }
                }
            });

            this.changeQueryStringVideoId(videoId);
        };
    }

    /**
     * Returns a Handler function for a Queue Element delete.
     * @param videoId
     */
    private queueElementDeleteHandler(videoId: string): () => void {
        return () => {
            this.sendWsMessage(Message.REMOVE_FROM_QUEUE, videoId);
        };
    }

    /**
     * Change the videoId in the current URL without reloading the page.
     *
     * @param videoId
     */
    private changeQueryStringVideoId(videoId: string): void {
        const params = new URLSearchParams(window.location.search);
        params.set('v', videoId);
        URLUtil.changeQueryString(params);
        this.selectQueueElement(videoId);
    }

    /**
     * Will seek the YT.Player to the given videoTime if the current time differers more than the given margin to the videoTime.
     *
     * @param videoTime The time the video should be set to
     * @param margin The difference the current video time and the to set video time need in order to seek
     */
    private syncPlayerTime(videoTime: number, margin: number = 1.0): void {
        if (Math.abs(videoTime - this.ytPlayer.getCurrentTime()) > margin) {
            this.ytPlayer.seekTo(videoTime, true);
        }
    }
}