<?php

declare(strict_types=1);

namespace OCA\BookedEventsWidget\AppInfo;

use OCA\BookedEventsWidget\Dashboard\BookedEventsWidget;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'booked_events_widget';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerDashboardWidget(BookedEventsWidget::class);
	}

	public function boot(IBootContext $context): void {
	}
}
