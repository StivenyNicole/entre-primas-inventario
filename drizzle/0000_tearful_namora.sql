CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`size` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`image_key` text,
	`sold_by` text,
	`sold_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
