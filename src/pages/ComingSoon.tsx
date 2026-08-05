import { Card, CardContent } from '../components/ui/Card';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>
      </div>

      <Card>
        <CardContent className="py-24 text-center">
          <Construction className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            En cours de développement
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Cette fonctionnalité sera bientôt disponible
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
