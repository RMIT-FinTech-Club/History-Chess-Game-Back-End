import * as amqp from "amqplib";
import { Channel, ChannelModel } from "amqplib";

let connection!: ChannelModel;
let channel!: Channel;

export async function getChannel(): Promise<Channel> {
  try {
    if (channel) return channel;

    const url = process.env.RABBITMQ_URL ?? "amqp://localhost:5672";

    if (!connection) {
      connection = await amqp.connect(url);

      connection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err);
        connection = null!;
        channel = null!;
      });

      connection.on("close", () => {
        console.log("RabbitMQ connection closed");
        connection = null!;
        channel = null!;
      });
    }

    channel = await connection.createChannel();

    channel.on("error", (err) => {
      console.error("RabbitMQ channel error:", err);
      channel = null!;
    });

    channel.on("close", () => {
      console.log("RabbitMQ channel closed");
      channel = null!;
    });

    await channel.assertQueue("marketplace.create", { durable: true });
    await channel.assertQueue("marketplace.purchase", { durable: true });
    await channel.assertQueue("marketplace.cancel", { durable: true });

    return channel;
  } catch (error) {
    console.error("Failed to get RabbitMQ channel:", error);
    throw error;
  }
}

export async function publish(queue: string, payload: unknown): Promise<void> {
  try {
    const channel = await getChannel();
    const success = channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true }
    );

    if (!success) {
      console.warn(`Message not queued for ${queue}, buffer may be full`);
    }
  } catch (error) {
    console.error(`Failed to publish message to ${queue}:`, error);
  }
}
