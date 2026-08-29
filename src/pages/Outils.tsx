import { useState } from 'react';
import { Wrench, TrendingDown, Landmark, Calendar, Calculator, MapPin, Building2, GraduationCap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { CSGCalculator } from '../components/outils/CSGCalculator';
import { TEOMCalculator } from '../components/outils/TEOMCalculator';
import { ExonerationSimulator } from '../components/outils/ExonerationSimulator';
import { ARDCalculator } from '../components/outils/ARDCalculator';
import { PostalCodeLookup } from '../components/outils/PostalCodeLookup';
import { CompanySearch } from '../components/outils/CompanySearch';
import { SchoolClassCalculator } from '../components/outils/SchoolClassCalculator';

const tools = [
  {
    id: 'csg',
    label: 'CSG / CRDS',
    description: 'Calculez les prelevements sociaux sur vos revenus',
    icon: TrendingDown,
    color: 'teal',
  },
  {
    id: 'teom',
    label: 'Taxe Fonciere Deductible',
    description: 'Calculez la taxe fonciere a declarer sur vos revenus',
    icon: Landmark,
    color: 'emerald',
  },
  {
    id: 'exoneration',
    label: 'Simulateur Exonérations',
    description: 'Visualisez les taux degressifs mois par mois',
    icon: Calendar,
    color: 'sky',
  },
  {
    id: 'ard',
    label: 'Amortissements Reputes Differes',
    description: 'Calculez le plafond deductible LMNP reel BIC',
    icon: Calculator,
    color: 'orange',
  },
  {
    id: 'codepostal',
    label: 'Code Postal',
    description: 'Recherchez une commune par code postal ou nom',
    icon: MapPin,
    color: 'rose',
  },
  {
    id: 'entreprise',
    label: 'Recherche Entreprise',
    description: 'Trouvez SIRET, adresse et code NAF par nom (INPI)',
    icon: Building2,
    color: 'cyan',
  },
  {
    id: 'classe',
    label: 'Classe Scolaire',
    description: 'Determinez la classe d\'un enfant a partir de sa date de naissance',
    icon: GraduationCap,
    color: 'blue',
  },
];

const colorMap: Record<string, { bg: string; icon: string; border: string; ring: string }> = {
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-950',
    icon: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
    ring: 'ring-teal-500',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    icon: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
    ring: 'ring-emerald-500',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950',
    icon: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
    ring: 'ring-sky-500',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
    ring: 'ring-orange-500',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950',
    icon: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800',
    ring: 'ring-rose-500',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950',
    icon: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
    ring: 'ring-cyan-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    ring: 'ring-blue-500',
  },
};

export function Outils() {
  const [activeTab, setActiveTab] = useState('csg');

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Outils
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Calculatrices et simulateurs pour votre cabinet
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const colors = colorMap[tool.color];
          const isActive = activeTab === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTab(tool.id)}
              className={`text-left transition-all duration-200 rounded-lg border p-4 ${
                isActive
                  ? `${colors.border} ${colors.bg} ring-2 ${colors.ring}`
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${colors.icon}`} />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${
                    isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {tool.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {tool.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

      </div>

      <Tabs defaultValue="csg" value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Outils de calcul">
          <TabsTrigger value="csg">
            <TrendingDown className="w-4 h-4 mr-2" />
            CSG / CRDS
          </TabsTrigger>
          <TabsTrigger value="teom">
            <Landmark className="w-4 h-4 mr-2" />
            Taxe Fonciere Deductible
          </TabsTrigger>
          <TabsTrigger value="exoneration">
            <Calendar className="w-4 h-4 mr-2" />
            Simulateur Exonérations
          </TabsTrigger>
          <TabsTrigger value="ard">
            <Calculator className="w-4 h-4 mr-2" />
            ARD (LMNP)
          </TabsTrigger>
          <TabsTrigger value="codepostal">
            <MapPin className="w-4 h-4 mr-2" />
            Code Postal
          </TabsTrigger>
          <TabsTrigger value="entreprise">
            <Building2 className="w-4 h-4 mr-2" />
            Recherche Entreprise
          </TabsTrigger>
          <TabsTrigger value="classe">
            <GraduationCap className="w-4 h-4 mr-2" />
            Classe Scolaire
          </TabsTrigger>
        </TabsList>

        <TabsContent value="csg" className="mt-6">
          <CSGCalculator />
        </TabsContent>

        <TabsContent value="teom" className="mt-6">
          <TEOMCalculator />
        </TabsContent>

        <TabsContent value="exoneration" className="mt-6">
          <ExonerationSimulator />
        </TabsContent>

        <TabsContent value="ard" className="mt-6">
          <ARDCalculator />
        </TabsContent>

        <TabsContent value="codepostal" className="mt-6">
          <PostalCodeLookup />
        </TabsContent>

        <TabsContent value="entreprise" className="mt-6">
          <CompanySearch />
        </TabsContent>

        <TabsContent value="classe" className="mt-6">
          <SchoolClassCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
