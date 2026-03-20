<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version1100Date20260318181500 extends SimpleMigrationStep {
	private const TABLE = 'bew_events';

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable(self::TABLE)) {
			return $schema;
		}

		$table = $schema->createTable(self::TABLE);
		$table->addColumn('id', 'integer', [
			'autoincrement' => true,
			'notnull' => true,
		]);
		$table->addColumn('title', 'string', [
			'length' => 255,
			'notnull' => true,
		]);
		$table->addColumn('event_date', 'string', [
			'length' => 10,
			'notnull' => true,
		]);
		$table->addColumn('location', 'string', [
			'length' => 255,
			'notnull' => true,
		]);
		$table->addColumn('status', 'string', [
			'length' => 120,
			'notnull' => true,
		]);
		$table->addColumn('sort_order', 'integer', [
			'default' => 0,
			'notnull' => true,
		]);
		$table->setPrimaryKey(['id']);
		$table->addIndex(['event_date'], 'bew_date_idx');

		return $schema;
	}
}
