import { Message } from '../enum/message';
import Client from '../model/client';

export default class SyncSocket {
  public socket: SocketIOClient.Socket;

  constructor(socket: SocketIOClient.Socket) {
    this.socket = socket;
  }

  /**
   * Send a message to the session containing the current video time as data
   *
   * @param type The type of the message
   */
  public sendWsTimeMessage(type: Message.PLAY | Message.PAUSE | Message.SEEK, ytPlayer: YT.Player): void {
    this.sendWsMessage(type, ytPlayer.getCurrentTime().toString());
  }

  /**
   * Send a message to the session
   *
   * @param type The message type
   * @param data The message data
   */
  private sendWsMessage(type: Message, data: any): void {
    const message = {
      action: type,
      data
    };
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Request to add the given Video to the Queue.
   * Will only work if the client has the needed Permissions.
   *
   * @param video The video that should be added to the Queue
   */
  public sendWsRequestToAddToQueue(video: Video): void {
    this.sendWsMessage(Message.ADD_TO_QUEUE, video);
  }

  /**
   * Request to remove the given Video from the Queue.
   * Will only work if the client has the needed Permissions.
   *
   * @param videoId The videoId of the video that should be removed from the Queue
   */
  public sendWsRequestToRemoveFromQueue(videoId: string): void {
    this.sendWsMessage(Message.REMOVE_FROM_QUEUE, videoId);
  }

  /**
   * Send a Reaction Message.
   *
   * @param reaction The reaction that should be send
   */
  public sendWsReactionMessage(reaction: Reaction): void {
    this.sendWsMessage(Message.REACTION, reaction.id);
  }

  /**
   * Request to play given Video.
   * Will only work if the client has the needed Permissions.
   *
   * @param videoId The video Id that should be played
   */
  public sendWsRequestToPlayVideo(videoId: string): void {
    this.sendWsMessage(Message.PLAY_VIDEO, videoId);
  }

  /**
   * Change the autoplay settings.
   * Will only work if the client has the needed Permissions.
   *
   * @param autoplay The new autoplay setting value
   */
  public sendWsAutoplayMessage(autoplay: boolean): void {
    this.sendWsMessage(Message.AUTOPLAY, autoplay);
  }

  /**
   * Promote the given client.
   * Will only work if the client has the needed Permissions.
   *
   * @param client The client that should be promoted
   */
  public sendWsPromoteMessage(client: Client): void {
    this.sendWsMessage(Message.PROMOTE, client.socketId);
  }

  /**
   * Unpromote the given client.
   * Will only work if the client has the needed Permissions.
   *
   * @param client The client that should be unpromoted
   */
  public sendWsUnpromoteMessage(client: Client): void {
    this.sendWsMessage(Message.UNPROMOTE, client.socketId);
  }
}