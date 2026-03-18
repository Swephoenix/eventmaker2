<?php
declare(strict_types=1);

style('booked_events_widget', 'manage');
?>

<div class="bew-manage">
	<div class="bew-manage__hero">
		<div>
			<div class="bew-manage__eyebrow">Booked Events</div>
			<h1 class="bew-manage__title">Hantera event</h1>
			<p class="bew-manage__intro">Skapa, redigera och ta bort event som visas i dashboard-widgeten.</p>
		</div>
	</div>

	<section class="bew-panel">
		<div class="bew-panel__header">
			<h2>Nytt event</h2>
		</div>
		<form class="bew-form bew-form--create" action="<?php p($_['createUrl']); ?>" method="post">
			<input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
			<label class="bew-field">
				<span>Titel</span>
				<input type="text" name="title" required>
			</label>
			<label class="bew-field">
				<span>Datum</span>
				<input type="text" name="date" required>
			</label>
			<label class="bew-field">
				<span>Plats</span>
				<input type="text" name="location" required>
			</label>
			<label class="bew-field">
				<span>Popuptext</span>
				<textarea name="description" rows="4"></textarea>
			</label>
			<label class="bew-field">
				<span>Länk</span>
				<input type="url" name="link">
			</label>
			<label class="bew-field">
				<span>Sortering</span>
				<input type="number" name="sort_order" value="50" required>
			</label>
			<button class="bew-button bew-button--primary" type="submit">Skapa event</button>
		</form>
	</section>

	<section class="bew-panel">
		<div class="bew-panel__header">
			<h2>Befintliga event</h2>
		</div>
		<div class="bew-grid">
			<?php foreach ($_['events'] as $event): ?>
				<article class="bew-card">
					<form class="bew-form" action="<?php p((string)$event['updateUrl']); ?>" method="post">
						<input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
						<label class="bew-field">
							<span>Titel</span>
							<input type="text" name="title" value="<?php p((string)$event['title']); ?>" required>
						</label>
						<label class="bew-field">
							<span>Datum</span>
							<input type="text" name="date" value="<?php p((string)$event['date']); ?>" required>
						</label>
						<label class="bew-field">
							<span>Plats</span>
							<input type="text" name="location" value="<?php p((string)$event['location']); ?>" required>
						</label>
						<label class="bew-field">
							<span>Popuptext</span>
							<textarea name="description" rows="4"><?php p((string)$event['description']); ?></textarea>
						</label>
						<label class="bew-field">
							<span>Länk</span>
							<input type="url" name="link" value="<?php p((string)$event['link']); ?>">
						</label>
						<label class="bew-field">
							<span>Sortering</span>
							<input type="number" name="sort_order" value="<?php p((string)$event['sort_order']); ?>" required>
						</label>
						<div class="bew-actions">
							<button class="bew-button bew-button--primary" type="submit">Spara</button>
						</div>
					</form>
					<form class="bew-delete" action="<?php p((string)$event['deleteUrl']); ?>" method="post">
						<input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
						<button class="bew-button bew-button--danger" type="submit">Ta bort</button>
					</form>
				</article>
			<?php endforeach; ?>
		</div>
	</section>
</div>
