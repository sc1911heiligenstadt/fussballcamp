<?php
/**
 * Plugin Name: SC 1911 Camp-Fenster
 * Description: Laedt das Fenster, das offene Fussballcamps auf der Vereinsseite ankuendigt. Der Inhalt kommt aus der Fussballcamp-App (sc1911heiligenstadt.github.io/fussballcamp) und wird dort gepflegt - hier wird ausschliesslich das Skript eingebunden. Erscheint kein Camp auf "Anmeldung offen", tut das Plugin gar nichts. Zum Abschalten einfach deaktivieren; die Seite bleibt dabei unveraendert.
 * Version: 1.0
 * Author: 1. SC 1911 e.V. Heilbad Heiligenstadt
 * Requires PHP: 7.0
 */

// Direktaufruf der Datei abweisen.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Bindet popup.js im Frontend ein.
 *
 * Das Skript entscheidet selbst, ob ueberhaupt ein Fenster erscheint: es fragt
 * den Vereins-Worker nach offenen Camps und tut gar nichts, wenn keines offen
 * ist oder der Besucher es weggeklickt hat (Merker im localStorage, 7 Tage).
 * Deshalb reicht das blosse Einbinden auf allen Seiten - hier ist keine
 * weitere Bedingung noetig.
 *
 * Bewusst KEIN Eintrag in der functions.php des Themes: Enfold laeuft hier ohne
 * Child-Theme, eine Aenderung dort waere beim naechsten Theme-Update weg.
 */
function sc1911_camp_fenster_einbinden() {
	// Im Backend und im Feed nichts laden.
	if ( is_admin() || is_feed() ) {
		return;
	}

	wp_enqueue_script(
		'sc1911-camp-fenster',
		'https://sc1911heiligenstadt.github.io/fussballcamp/popup.js',
		array(),
		// Keine Version anhaengen: die Datei liegt auf GitHub Pages und traegt
		// dort ihre eigene Auslieferungs-Kennung.
		null,
		// Ab WordPress 6.3 wird das Array ausgewertet (async + im Footer).
		// Aeltere Fassungen lesen es als "true" - dann laedt das Skript ohne
		// async im Footer, was ebenfalls funktioniert.
		array(
			'strategy'  => 'async',
			'in_footer' => true,
		)
	);
}
add_action( 'wp_enqueue_scripts', 'sc1911_camp_fenster_einbinden' );
