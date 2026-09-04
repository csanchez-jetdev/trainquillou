from django.core.management.base import BaseCommand

from tgvmax import ingest, tasks


class Command(BaseCommand):
    help = "Programme l'ingestion quotidienne des disponibilités TGVmax, ou l'exécute."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--now",
            action="store_true",
            help="exécute l'ingestion dans ce process, sans passer par la file",
        )

    def handle(self, *args, **options) -> None:
        if options["now"]:
            self.stdout.write(self.style.SUCCESS(str(ingest.run().as_dict())))
            return

        when = tasks.ensure_scheduled()
        if when is None:
            self.stdout.write("ingestion déjà programmée, rien à faire")
        else:
            self.stdout.write(
                self.style.SUCCESS(f"ingestion programmée pour {when:%Y-%m-%d %H:%M} UTC")
            )
