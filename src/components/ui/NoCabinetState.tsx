import { Building } from 'lucide-react';
import { Card, CardContent } from './Card';

export function NoCabinetState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Building className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
        <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
          Aucun cabinet assigné
        </p>
        <p className="text-gray-500 dark:text-gray-400">
          Contactez un administrateur pour obtenir l'accès à un cabinet.
        </p>
      </CardContent>
    </Card>
  );
}
