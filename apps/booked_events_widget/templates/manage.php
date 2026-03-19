<?php
declare(strict_types=1);

style('booked_events_widget', 'manage');

$buildDateParts = static function (string $date): array {
	$date = trim($date);
	if ($date === '') {
		return ['datum', 'saknas'];
	}

	$parts = preg_split('/\s+/', $date, 2);
	if ($parts === false || $parts === []) {
		return ['datum', $date];
	}

	if (count($parts) === 1) {
		return ['datum', $parts[0]];
	}

	return [mb_strtolower((string)$parts[0]), (string)$parts[1]];
};

$clientEvents = array_map(static function (array $event): array {
	$title = (string)$event['title'];
	$date = (string)$event['date'];
	$location = (string)$event['location'];

	return [
		'id' => (int)$event['id'],
		'title' => $title,
		'date' => $date,
		'location' => $location,
		'description' => (string)$event['description'],
		'link' => (string)$event['link'],
		'isApi' => (bool)($event['is_api'] ?? false),
		'sortOrder' => (int)$event['sort_order'],
		'updateUrl' => (string)$event['updateUrl'],
		'saveStaffUrl' => (string)$event['saveStaffUrl'],
		'deleteUrl' => (string)$event['deleteUrl'],
		'staff' => array_values(array_map(static function (array $person): array {
			return [
				'userId' => (string)($person['userId'] ?? ''),
				'firstName' => (string)($person['firstName'] ?? ''),
				'lastName' => (string)($person['lastName'] ?? ''),
				'email' => (string)($person['email'] ?? ''),
				'role' => (string)($person['role'] ?? ''),
				'area' => (string)($person['area'] ?? ''),
			];
		}, (array)($event['staff'] ?? []))),
		'material' => [
			['text' => 'Ta med rollup', 'done' => false, 'ownerUserId' => '', 'ownerName' => ''],
			['text' => 'Ta med flyers', 'done' => true, 'ownerUserId' => '', 'ownerName' => ''],
			['text' => 'Kontrollera länkinformation för ' . $title, 'done' => false, 'ownerUserId' => '', 'ownerName' => ''],
		],
		'marketing' => [
			['city' => $location, 'mailSent' => 'Ja', 'facebookPages' => 'Lokala grupper och evenemangssidor', 'comment' => 'Prioritera orten närmast eventet'],
			['city' => 'Närliggande ort', 'mailSent' => 'Nej', 'facebookPages' => 'Regionala sidor', 'comment' => 'Skicka om det finns plats kvar'],
		],
		'chat' => [
			['type' => 'system', 'text' => 'Vi behöver säkerställa att rollup, flyers och kontaktlista är på plats före avfärd.'],
			['type' => 'me', 'text' => 'Jag tar med rollup och bordsmaterial.'],
			['type' => 'system', 'text' => 'Bra. Lägg gärna till vem som ansvarar för bemanningen i personalfliken.'],
		],
	];
}, $_['events']);
?>

<div
	class="bew-manage app"
	data-requesttoken="<?php p($_['requesttoken']); ?>"
	data-create-url="<?php p($_['createUrl']); ?>"
	data-view-mode="<?php p((string)$_['viewMode']); ?>"
>
	<script id="bew-state" type="application/json"><?php print_unescaped(json_encode(['events' => $clientEvents, 'users' => $_['users'], 'currentUser' => $_['currentUser']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></script>

	<section class="layout">
		<aside class="sidebar">
			<div class="sidebar-head">
				<h2 class="sidebar-title">Booked events</h2>
				<p class="sidebar-subtitle">Välj ett event i listan. Kortet till höger visar sammanfattning först och redigeringsytor direkt under.</p>
				<?php if ((string)$_['viewMode'] === 'eventpersonal' && $_['currentUser'] !== null): ?>
					<label class="sidebar-filter">
						<input type="checkbox" id="bookedOnlyToggle">
						<span>Visa bara event där jag är bokad</span>
					</label>
				<?php endif; ?>
			</div>

			<div class="event-list" id="eventList">
				<?php foreach ($_['events'] as $index => $event): ?>
					<?php [$dateTop, $dateBottom] = $buildDateParts((string)$event['date']); ?>
					<button class="event-card<?php p($index === 0 ? ' active' : ''); ?>" type="button" data-event-id="<?php p((string)$event['id']); ?>">
						<div class="event-date">
							<div class="event-month"><?php p($dateTop); ?></div>
							<div class="event-day"><?php p($dateBottom); ?></div>
						</div>
						<div class="event-body">
							<h3 class="event-title"><?php p((string)$event['title']); ?></h3>
							<p class="event-meta"><?php p((string)$event['location']); ?></p>
						</div>
					</button>
				<?php endforeach; ?>
			</div>
		</aside>

		<main class="main">
			<div class="main-head">
				<div class="main-kicker">Redigera</div>
				<div class="main-title-row">
					<div class="main-title">
						<h2 id="mainTitle">Event</h2>
						<div class="main-meta">
							<span class="badge" id="mainDateBadge">Datum</span>
							<span class="badge" id="mainLocationBadge">Plats</span>
						</div>
					</div>
				</div>
			</div>

			<div class="main-body">
				<div class="tabbar">
					<button class="tab-btn active" type="button" data-tab="overview">Översikt</button>
					<button class="tab-btn" type="button" data-tab="staff">Personal</button>
					<button class="tab-btn" type="button" data-tab="material">Material</button>
					<button class="tab-btn" type="button" data-tab="marketing">Marknadsföring</button>
				</div>

				<div class="content-grid">
					<section class="panel editor-panel">
						<div id="dynamicContent"></div>
					</section>

					<aside class="panel chat-panel">
						<div class="chat-head">
							<h3 class="chat-title">Chat</h3>
							<p class="chat-sub">Intern samordning för eventet. Den här panelen ligger kvar när du byter flik.</p>
						</div>

						<div class="chat-box" id="chatBox"></div>

						<div class="chat-compose">
							<input class="chat-input" id="chatInput" type="text" placeholder="Skriv ett meddelande och tryck Enter">
							<button class="btn btn-accent" type="button" id="sendBtn">Skicka</button>
						</div>
					</aside>
				</div>
			</div>
		</main>
	</section>
</div>
